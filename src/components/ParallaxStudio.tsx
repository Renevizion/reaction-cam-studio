import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ImageSegmenter, FilesetResolver, type MPMask } from "@mediapipe/tasks-vision";
import { Crop, Download, Eye, EyeOff, FileText, ImageIcon, LayoutPanelTop, PanelsTopLeft } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAspectRatio } from "@/hooks/useAspectRatio";
import { useLogo } from "@/hooks/useLogo";
import { useOverlays } from "@/hooks/useOverlays";
import { useRecordings } from "@/hooks/useRecordings";
import { useTeleprompter } from "@/hooks/useTeleprompter";
import { defaultLocalCaptureConfig, generateLocalCaptureFiles, generateLocalCaptureSetup, type LocalCaptureConfig } from "@/lib/localCaptureKit";
import { toast } from "sonner";
import type { Recording } from "@/hooks/useRecorder";

const AspectRatioSelector = lazy(() => import("@/components/AspectRatioSelector").then((module) => ({ default: module.AspectRatioSelector })));
const TeleprompterEditor = lazy(() => import("@/components/TeleprompterEditor").then((module) => ({ default: module.TeleprompterEditor })));
const LogoUploader = lazy(() => import("@/components/LogoUploader").then((module) => ({ default: module.LogoUploader })));
const OverlayEditor = lazy(() => import("@/components/OverlayEditor").then((module) => ({ default: module.OverlayEditor })));
const RecordingsGallery = lazy(() => import("@/components/RecordingsGallery").then((module) => ({ default: module.RecordingsGallery })));
const SoundEffectsBoard = lazy(() => import("@/components/SoundEffectsBoard").then((module) => ({ default: module.SoundEffectsBoard })));
const VideoPlayerModal = lazy(() => import("@/components/VideoPlayerModal").then((module) => ({ default: module.VideoPlayerModal })));

type Transform = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  tiltX: number;
  tiltY: number;
  opacity: number;
  scale: number;
};

type LayerKey = "screen" | "webcam";

type DragState =
  | { type: "move"; layer: LayerKey; startX: number; startY: number; origX: number; origY: number }
  | {
      type: "resize";
      layer: LayerKey;
      corner: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: Transform;
    }
  | {
      type: "rotate";
      layer: LayerKey;
      cx: number;
      cy: number;
      startAngle: number;
      origRot: number;
    }
  | null;

type Preset = {
  id: string;
  name: string;
  screen: Transform;
  webcam: Transform;
  order: LayerKey[];
  bgTone: BgTone;
  shadow: boolean;
  rounded: boolean;
  roundedRadius: number;
  createdAt: number;
};

type BgTone = "black" | "studio" | "grid" | "aurora";
type QualityTier = "high" | "medium" | "low";
type RecordingQualityPreset = "balanced" | "high" | "max";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const SAFE_MARGIN = 60;
const GRID_SIZE = 40;
const PRESETS_KEY = "parallax-studio.presets.v1";
const TEMPLATES_SEEDED_KEY = "parallax-studio.templates.seeded.v1";
const CAPTURE_KIT_KEY = "parallax-studio.capture-kit.v1";
const KICK_RTMPS_URL = "rtmps://fa723fc1b171.global-contribute.live-video.net/app/";
const QUICK_START_DISMISSED_KEY = "scriptcam.quick-start.dismissed.v1";
const AUDIO_MIX_KEY = "scriptcam.audio-mix.v1";
const CAMERA_DEVICE_KEY = "scriptcam.camera-device.v1";
const MIC_DEVICE_KEY = "scriptcam.mic-device.v1";
const RECORDING_CAPTURE_FPS = 60;

const RECORDING_QUALITY_BITS_PER_PIXEL: Record<RecordingQualityPreset, number> = {
  balanced: 0.09,
  high: 0.14,
  max: 0.2,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const estimateVideoBitrate = (
  width: number,
  height: number,
  fps: number,
  preset: RecordingQualityPreset,
) => {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps);
  const target = Math.round(pixelsPerSecond * RECORDING_QUALITY_BITS_PER_PIXEL[preset]);
  return clamp(target, 6_000_000, 30_000_000);
};

const canPlaybackMimeType = (type: string) => {
  const probe = document.createElement("video");
  if (probe.canPlayType(type)) return true;
  const baseType = type.split(";")[0] ?? type;
  return !!probe.canPlayType(baseType);
};

const getPreferredRecorderMimeType = (candidates: string[]) =>
  candidates.find((type) => MediaRecorder.isTypeSupported(type) && canPlaybackMimeType(type));

const createThumbnailFromBlob = async (blob: Blob): Promise<string | undefined> => {
  if (typeof document === "undefined") return undefined;

  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const waitForEvent = <K extends keyof HTMLMediaElementEventMap>(
    target: HTMLMediaElement,
    event: K,
    timeoutMs: number,
  ) => new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${String(event)}`));
    }, timeoutMs);

    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("thumbnail decode failed"));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      target.removeEventListener(event, onSuccess);
      target.removeEventListener("error", onError);
    };

    target.addEventListener(event, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });

  try {
    await waitForEvent(video, "loadeddata", 4000);
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      video.currentTime = Math.min(0.2, Math.max(0.05, video.duration / 10));
      await waitForEvent(video, "seeked", 3000);
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
};

const formatUserMediaError = (error: unknown, sourceLabel: string) => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return `${sourceLabel} permission is blocked. Allow access in your browser settings.`;
    }
    if (error.name === "NotFoundError") {
      return `${sourceLabel} device not found. Reconnect the device and try again.`;
    }
    if (error.name === "NotReadableError") {
      return `${sourceLabel} is busy in another app or tab. Close other camera apps and retry.`;
    }
    if (error.name === "OverconstrainedError") {
      return `${sourceLabel} could not satisfy current constraints. Try Auto or another device.`;
    }
    if (error.name === "AbortError") {
      return `${sourceLabel} start was interrupted. Try once more.`;
    }
  }
  return error instanceof Error ? error.message : "capture failed";
};

const getRecordingProfile = (width: number, height: number, fps: number, preset: RecordingQualityPreset) => {
  const videoBitsPerSecond = estimateVideoBitrate(width, height, fps, preset);
  const audioBitsPerSecond = 320_000;
  const mimeType = getPreferredRecorderMimeType([
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ]);

  return {
    width,
    height,
    fps,
    preset,
    mimeType,
    videoBitsPerSecond,
    audioBitsPerSecond,
  };
};

const formatMegabits = (bitsPerSecond: number) => `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;

const defaultScreen: Transform = {
  x: -80, y: -45, w: 2080, h: 1170,
  rotation: 0, tiltX: 0, tiltY: 0, opacity: 1, scale: 1,
};
const defaultWebcam: Transform = {
  x: 1290, y: 610, w: 560, h: 420,
  rotation: 0, tiltX: 0, tiltY: 0, opacity: 1, scale: 1,
};

const QUALITY_SETTINGS: Record<QualityTier, { shadowBlur: number; scale: number; targetFps: number }> = {
  high: { shadowBlur: 80, scale: 1, targetFps: 60 },
  medium: { shadowBlur: 36, scale: 0.85, targetFps: 45 },
  low: { shadowBlur: 12, scale: 0.66, targetFps: 30 },
};

const BUILTIN_TEMPLATES: Omit<Preset, "id" | "createdAt">[] = [
  {
    name: "★ Cinematic Studio",
    screen: { x: 90, y: 60, w: 1550, h: 872, rotation: -8, tiltX: 12, tiltY: -16, opacity: 0.9, scale: 1 },
    webcam: { x: 1080, y: 380, w: 760, h: 600, rotation: 3, tiltX: 2, tiltY: -2, opacity: 1, scale: 1 },
    order: ["screen", "webcam"], bgTone: "aurora", shadow: true, rounded: true, roundedRadius: 40,
  },
  {
    name: "★ Tech Podcast", 
    screen: { x: 60, y: 100, w: 1200, h: 675, rotation: -4, tiltX: 6, tiltY: -8, opacity: 0.85, scale: 1 },
    webcam: { x: 1200, y: 220, w: 660, h: 740, rotation: 0, tiltX: 0, tiltY: 0, opacity: 1, scale: 1 },
    order: ["screen", "webcam"], bgTone: "studio", shadow: true, rounded: true, roundedRadius: 32,
  },
  {
    name: "★ Behind-the-Shoulder",
    screen: { x: 320, y: 40, w: 1500, h: 844, rotation: -10, tiltX: 14, tiltY: -18, opacity: 0.82, scale: 1 },
    webcam: { x: 40, y: 240, w: 700, h: 800, rotation: -2, tiltX: 0, tiltY: 4, opacity: 1, scale: 1 },
    order: ["screen", "webcam"], bgTone: "aurora", shadow: true, rounded: true, roundedRadius: 48,
  },
  {
    name: "★ Presenter Focus",
    screen: { x: 900, y: 100, w: 950, h: 534, rotation: 4, tiltX: -6, tiltY: 8, opacity: 0.9, scale: 1 },
    webcam: { x: 60, y: 60, w: 820, h: 960, rotation: 0, tiltX: 0, tiltY: 0, opacity: 1, scale: 1 },
    order: ["screen", "webcam"], bgTone: "studio", shadow: true, rounded: true, roundedRadius: 28,
  },
];

const normalizeCaptureConfig = (config: LocalCaptureConfig): LocalCaptureConfig => {
  const displayW = Math.max(1, Math.round(config.displayW));
  const displayH = Math.max(1, Math.round(config.displayH));
  const cropW = Math.max(1, Math.min(Math.round(config.w), displayW));
  const cropH = Math.max(1, Math.min(Math.round(config.h), displayH));
  const cropX = Math.max(0, Math.min(Math.round(config.x), displayW - cropW));
  const cropY = Math.max(0, Math.min(Math.round(config.y), displayH - cropH));

  return {
    ...config,
    videoIndex: Math.max(0, Math.round(config.videoIndex)),
    audioIndex: Math.max(0, Math.round(config.audioIndex)),
    displayW,
    displayH,
    x: cropX,
    y: cropY,
    w: cropW,
    h: cropH,
    fps: Math.max(1, Math.round(config.fps)),
    segmentSeconds: Math.max(0, Math.round(config.segmentSeconds)),
    crf: Math.max(0, Math.round(config.crf)),
  };
};

export default function Compositor() {
  const { aspectRatio, currentConfig, changeAspectRatio } = useAspectRatio();
  const teleprompter = useTeleprompter();
  const logo = useLogo();
  const overlays = useOverlays();
  const { recordings, addRecording, deleteRecording, downloadRecording, shareRecording } = useRecordings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastScreenFrameRef = useRef<HTMLCanvasElement | null>(null);
  const lastWebcamFrameRef = useRef<HTMLCanvasElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recElapsedRef = useRef(0);

  const screenT = useRef<Transform>(defaultScreen);
  const webcamT = useRef<Transform>(defaultWebcam);
  const [screenState, setScreenState] = useState<Transform>(screenT.current);
  const [webcamState, setWebcamState] = useState<Transform>(webcamT.current);

  const [screenReady, setScreenReady] = useState(false);
  const [webcamReady, setWebcamReady] = useState(false);
  const [startingWebcam, setStartingWebcam] = useState(false);
  const [screenMeta, setScreenMeta] = useState<string>("");
  const [webcamMeta, setWebcamMeta] = useState<string>("");
  const [activeCameraLabel, setActiveCameraLabel] = useState("");
  const [activeMicLabel, setActiveMicLabel] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(() => localStorage.getItem(CAMERA_DEVICE_KEY) || "");
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState(() => localStorage.getItem(MIC_DEVICE_KEY) || "");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  recElapsedRef.current = recElapsed;
  const [shadow, setShadow] = useState(true);
  const [rounded, setRounded] = useState(true);
  const [roundedRadius, setRoundedRadius] = useState(28);
  const [selected, setSelected] = useState<LayerKey>("screen");
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [bgTone, setBgTone] = useState<BgTone>("black");
  const [order, setOrder] = useState<LayerKey[]>(["screen", "webcam"]);
  const [snapGrid, setSnapGrid] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [quality, setQuality] = useState<QualityTier>("high");
  const [autoQuality, setAutoQuality] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [perfWarn, setPerfWarn] = useState<string | null>(null);

  // Pause / BRB
  const [screenPaused, setScreenPaused] = useState(false);
  const [webcamPaused, setWebcamPaused] = useState(false);
  const screenFrozenRef = useRef<HTMLCanvasElement | null>(null);
  const webcamFrozenRef = useRef<HTMLCanvasElement | null>(null);
  const [brbActive, setBrbActive] = useState(false);
  const [brbText, setBrbText] = useState("BE RIGHT BACK");
  const [brbSubtext, setBrbSubtext] = useState("Grabbing coffee — back in a moment");
  const [micMuted, setMicMuted] = useState(() => {
    try {
      const raw = localStorage.getItem(AUDIO_MIX_KEY);
      return raw ? Boolean(JSON.parse(raw).micMuted) : false;
    } catch {
      return false;
    }
  });
  const [screenAudioMuted, setScreenAudioMuted] = useState(() => {
    try {
      const raw = localStorage.getItem(AUDIO_MIX_KEY);
      return raw ? Boolean(JSON.parse(raw).screenAudioMuted) : false;
    } catch {
      return false;
    }
  });
  const [micVolume, setMicVolume] = useState(() => {
    try {
      const raw = localStorage.getItem(AUDIO_MIX_KEY);
      const value = raw ? Number(JSON.parse(raw).micVolume) : 100;
      return Number.isFinite(value) ? value : 100;
    } catch {
      return 100;
    }
  });
  const [screenAudioVolume, setScreenAudioVolume] = useState(() => {
    try {
      const raw = localStorage.getItem(AUDIO_MIX_KEY);
      const value = raw ? Number(JSON.parse(raw).screenAudioVolume) : 100;
      return Number.isFinite(value) ? value : 100;
    } catch {
      return 100;
    }
  });
  const [micAudioAvailable, setMicAudioAvailable] = useState(false);
  const [screenAudioAvailable, setScreenAudioAvailable] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [screenAudioLevel, setScreenAudioLevel] = useState(0);
  const [screenAudioSmokeTesting, setScreenAudioSmokeTesting] = useState(false);
  const [screenAudioSmokeStatus, setScreenAudioSmokeStatus] = useState<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const screenAudioGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const screenAudioAnalyserRef = useRef<AnalyserNode | null>(null);
  const mixedAudioInputsRef = useRef(0);

  // Cinematic
  const [cinematic, setCinematic] = useState(true);
  const [autoParallax, setAutoParallax] = useState(true);
  const autoParallaxRef = useRef(true);
  autoParallaxRef.current = autoParallax;
  const cinematicRef = useRef(true);
  cinematicRef.current = cinematic;

  // Segmentation (person cutout via MediaPipe Selfie Segmenter)
  const [segmentEnabled, setSegmentEnabled] = useState(false);
  const [segmentReady, setSegmentReady] = useState(false);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentInvert, setSegmentInvert] = useState(true);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [featherPx, setFeatherPx] = useState(2);
  const [faceParallax, setFaceParallax] = useState(true);
  const [parallaxStrength, setParallaxStrength] = useState(60);
  // "screen-clipped" = full webcam always visible; cutout applied ONLY where screen overlaps
  // "full-cutout"    = silhouette on top of screen; background disappears when inverted
  const [segmentMode, setSegmentMode] = useState<"screen-clipped" | "full-cutout">("screen-clipped");
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSegAtRef = useRef(0);
  const segBusyRef = useRef(false);
  const headPosRef = useRef({ x: 0.5, y: 0.5 });
  const headSmoothRef = useRef({ x: 0.5, y: 0.5 });
  const segmentEnabledRef = useRef(false);
  segmentEnabledRef.current = segmentEnabled;
  const segmentInvertRef = useRef(true);
  segmentInvertRef.current = segmentInvert;
  const featherRef = useRef(2);
  featherRef.current = featherPx;
  const faceParallaxRef = useRef(true);
  faceParallaxRef.current = faceParallax;
  const parallaxStrengthRef = useRef(60);
  parallaxStrengthRef.current = parallaxStrength;
  const segmentModeRef = useRef<"screen-clipped" | "full-cutout">("screen-clipped");
  segmentModeRef.current = segmentMode;

  // Layer locks + alt-to-click-through
  const [screenLocked, setScreenLocked] = useState(false);
  const [webcamLocked, setWebcamLocked] = useState(false);
  const [altHeld, setAltHeld] = useState(false);

  // Custom background image
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!customBgUrl) { customBgImgRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { customBgImgRef.current = img; };
    img.src = customBgUrl;
  }, [customBgUrl]);

  // Streaming (local FFmpeg bridge)
  const [streamUrl, setStreamUrl] = useState(() => localStorage.getItem("parallax.streamUrl") || "");
  const [streamKey, setStreamKey] = useState(() => localStorage.getItem("parallax.streamKey") || "");
  const [streamBitrate, setStreamBitrate] = useState(() => {
    const stored = Number(localStorage.getItem("parallax.streamBitrate"));
    return Number.isFinite(stored) && stored > 0 ? stored : 9000;
  });
  const [streamFps, setStreamFps] = useState(() => {
    const stored = Number(localStorage.getItem("parallax.streamFps"));
    return stored === 30 || stored === 60 ? stored : 60;
  });
  const [streamKeyframe, setStreamKeyframe] = useState(2);
  const [bridgePort, setBridgePort] = useState(9999);
  const [streaming, setStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>("");
  const [recordingQualityPreset, setRecordingQualityPreset] = useState<RecordingQualityPreset>(() => {
    const stored = localStorage.getItem("parallax.recordingQuality");
    return stored === "balanced" || stored === "high" || stored === "max" ? stored : "high";
  });
  const streamRecRef = useRef<MediaRecorder | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const teleprompterOffsetRef = useRef(0);
  const [showCreatorTools, setShowCreatorTools] = useState(false);
  const [showTeleprompterEditor, setShowTeleprompterEditor] = useState(false);
  const [showLogoUploader, setShowLogoUploader] = useState(false);
  const [showAspectRatio, setShowAspectRatio] = useState(false);
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showSoundEffects, setShowSoundEffects] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  const [showPrepPanel, setShowPrepPanel] = useState(false);
  const [showDockPresets, setShowDockPresets] = useState(false);
  const [captureConfig, setCaptureConfig] = useState<LocalCaptureConfig>(() => {
    try {
      const raw = localStorage.getItem(CAPTURE_KIT_KEY);
      return raw ? normalizeCaptureConfig({ ...defaultLocalCaptureConfig, ...JSON.parse(raw) }) : defaultLocalCaptureConfig;
    } catch {
      return defaultLocalCaptureConfig;
    }
  });
  const [capturePreviewVisible, setCapturePreviewVisible] = useState(true);
  const [quickStartDismissed, setQuickStartDismissed] = useState(() => localStorage.getItem(QUICK_START_DISMISSED_KEY) === "1");
  useEffect(() => { localStorage.setItem("parallax.streamUrl", streamUrl); }, [streamUrl]);
  useEffect(() => { localStorage.setItem("parallax.streamKey", streamKey); }, [streamKey]);
  useEffect(() => { localStorage.setItem("parallax.streamBitrate", String(streamBitrate)); }, [streamBitrate]);
  useEffect(() => { localStorage.setItem("parallax.streamFps", String(streamFps)); }, [streamFps]);
  useEffect(() => { localStorage.setItem("parallax.recordingQuality", recordingQualityPreset); }, [recordingQualityPreset]);
  useEffect(() => { localStorage.setItem(QUICK_START_DISMISSED_KEY, quickStartDismissed ? "1" : "0"); }, [quickStartDismissed]);
  useEffect(() => {
    localStorage.setItem(AUDIO_MIX_KEY, JSON.stringify({
      micMuted,
      screenAudioMuted,
      micVolume,
      screenAudioVolume,
    }));
  }, [micMuted, screenAudioMuted, micVolume, screenAudioVolume]);

  useEffect(() => {
    teleprompterOffsetRef.current = 0;
  }, [teleprompter.state.script, teleprompter.state.fontSize]);

  useEffect(() => {
    if (!logo.config.url) {
      logoImageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => { logoImageRef.current = image; };
    image.src = logo.config.url;
  }, [logo.config.url]);

  useEffect(() => {
    localStorage.setItem(CAPTURE_KIT_KEY, JSON.stringify(captureConfig));
  }, [captureConfig]);

  useEffect(() => {
    localStorage.setItem(CAMERA_DEVICE_KEY, selectedCameraDeviceId);
  }, [selectedCameraDeviceId]);
  useEffect(() => {
    localStorage.setItem(MIC_DEVICE_KEY, selectedMicDeviceId);
  }, [selectedMicDeviceId]);

  const qualityRef = useRef<QualityTier>("high");
  qualityRef.current = quality;
  const snapRef = useRef(false);
  snapRef.current = snapGrid;
  const teleprompterStateRef = useRef(teleprompter.state);
  teleprompterStateRef.current = teleprompter.state;

  // load presets + seed built-in templates once
  useEffect(() => {
    let list: Preset[] = [];
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) list = JSON.parse(raw);
    } catch {}
    const seeded = localStorage.getItem(TEMPLATES_SEEDED_KEY);
    if (!seeded) {
      const tpl: Preset[] = BUILTIN_TEMPLATES.map((p, i) => ({
        ...p, id: `tpl_${i}`, createdAt: Date.now() - i,
      }));
      list = [...tpl, ...list];
      try {
        localStorage.setItem(TEMPLATES_SEEDED_KEY, "1");
        localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
      } catch {}
    }
    setPresets(list);
  }, []);
  const persistPresets = (list: Preset[]) => {
    setPresets(list);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
    } catch {}
  };

  useEffect(() => {
    if (!screenVideoRef.current) {
      const v = document.createElement("video");
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      screenVideoRef.current = v;
    }
    if (!webcamVideoRef.current) {
      const v = document.createElement("video");
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      webcamVideoRef.current = v;
    }
  }, []);

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((device) => device.kind === "videoinput"));
      setAudioInputDevices(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      // Ignore device enumeration errors until permission is granted.
    }
  }, []);

  useEffect(() => {
    void refreshMediaDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    const onDeviceChange = () => { void refreshMediaDevices(); };
    mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [refreshMediaDevices]);

  useEffect(() => {
    if (!selectedCameraDeviceId) return;
    if (videoDevices.some((device) => device.deviceId === selectedCameraDeviceId)) return;
    setSelectedCameraDeviceId("");
  }, [selectedCameraDeviceId, videoDevices]);

  useEffect(() => {
    if (!selectedMicDeviceId || selectedMicDeviceId === "none") return;
    if (audioInputDevices.some((device) => device.deviceId === selectedMicDeviceId)) return;
    setSelectedMicDeviceId("");
  }, [audioInputDevices, selectedMicDeviceId]);

  const ensureAudioMixer = useCallback(() => {
    if (audioContextRef.current && audioDestinationRef.current) {
      return { context: audioContextRef.current, destination: audioDestinationRef.current };
    }

    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    const destination = context.createMediaStreamDestination();
    audioContextRef.current = context;
    audioDestinationRef.current = destination;
    return { context, destination };
  }, []);

  const rebuildAudioMixer = useCallback(async () => {
    const mixer = ensureAudioMixer();
    if (!mixer) {
      mixedAudioInputsRef.current = 0;
      setMicAudioAvailable(false);
      setScreenAudioAvailable(false);
      return;
    }

    const { context, destination } = mixer;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Ignore resume failures until the next user gesture.
      }
    }

    micSourceRef.current?.disconnect();
    screenAudioSourceRef.current?.disconnect();
    micGainRef.current?.disconnect();
    screenAudioGainRef.current?.disconnect();
    micAnalyserRef.current?.disconnect();
    screenAudioAnalyserRef.current?.disconnect();
    micSourceRef.current = null;
    screenAudioSourceRef.current = null;
    micGainRef.current = null;
    screenAudioGainRef.current = null;
    micAnalyserRef.current = null;
    screenAudioAnalyserRef.current = null;

    let inputs = 0;
    const micTracks = webcamStreamRef.current?.getAudioTracks() ?? [];
    const screenTracks = screenStreamRef.current?.getAudioTracks() ?? [];

    setMicAudioAvailable(micTracks.length > 0);
    setScreenAudioAvailable(screenTracks.length > 0);

    if (micTracks.length > 0) {
      const micStream = new MediaStream(micTracks);
      const micSource = context.createMediaStreamSource(micStream);
      const micGain = context.createGain();
      const micAnalyser = context.createAnalyser();
      micAnalyser.fftSize = 512;
      micGain.gain.value = micMuted ? 0 : micVolume / 100;
      micSource.connect(micGain);
      micGain.connect(destination);
      micGain.connect(micAnalyser);
      micSourceRef.current = micSource;
      micGainRef.current = micGain;
      micAnalyserRef.current = micAnalyser;
      inputs += 1;
    }

    if (screenTracks.length > 0) {
      const screenAudioStream = new MediaStream(screenTracks);
      const screenSource = context.createMediaStreamSource(screenAudioStream);
      const screenGain = context.createGain();
      const screenAnalyser = context.createAnalyser();
      screenAnalyser.fftSize = 512;
      screenGain.gain.value = screenAudioMuted ? 0 : screenAudioVolume / 100;
      screenSource.connect(screenGain);
      screenGain.connect(destination);
      screenGain.connect(screenAnalyser);
      screenAudioSourceRef.current = screenSource;
      screenAudioGainRef.current = screenGain;
      screenAudioAnalyserRef.current = screenAnalyser;
      inputs += 1;
    }

    mixedAudioInputsRef.current = inputs;
  }, [ensureAudioMixer, micMuted, micVolume, screenAudioMuted, screenAudioVolume]);

  const appendMixedAudioTracks = useCallback((stream: MediaStream) => {
    if (mixedAudioInputsRef.current < 1) return;
    const track = audioDestinationRef.current?.stream.getAudioTracks()[0];
    if (track) stream.addTrack(track);
  }, []);

  useEffect(() => {
    void rebuildAudioMixer();
  }, [rebuildAudioMixer, screenReady, webcamReady]);

  useEffect(() => {
    let raf = 0;
    const sampleLevel = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let index = 0; index < data.length; index += 1) {
        const normalized = Math.abs((data[index] - 128) / 128);
        if (normalized > peak) peak = normalized;
      }
      return Math.min(1, peak * 1.8);
    };

    const tick = () => {
      setMicLevel(sampleLevel(micAnalyserRef.current));
      setScreenAudioLevel(sampleLevel(screenAudioAnalyserRef.current));
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const runScreenAudioSmokeTest = useCallback(async () => {
    if (!window.isSecureContext) {
      setScreenAudioSmokeStatus("Smoke test requires a secure context. Open the studio on localhost or HTTPS.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenAudioSmokeStatus("This browser does not support screen capture via getDisplayMedia.");
      return;
    }

    setScreenAudioSmokeTesting(true);
    setScreenAudioSmokeStatus("Share a tab or window with audio already playing. The studio will inspect the returned stream and stop it immediately.");

    let stream: MediaStream | null = null;
    let testContext: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setScreenAudioSmokeStatus("No screen-audio track came back. In Chromium this usually means the chosen source did not expose audio or the browser only supports tab audio for that source.");
        return;
      }

      const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        setScreenAudioSmokeStatus(`Screen audio track detected: ${audioTracks[0].label || "unnamed source"}. This browser does not expose AudioContext analysis, so availability is confirmed but live level probing is skipped.`);
        return;
      }

      testContext = new AudioContextCtor();
      if (testContext.state === "suspended") {
        try {
          await testContext.resume();
        } catch {
          // Continue; some browsers will still allow graph inspection.
        }
      }

      const analyser = testContext.createAnalyser();
      analyser.fftSize = 512;
      const source = testContext.createMediaStreamSource(new MediaStream(audioTracks));
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const deadline = performance.now() + 1800;
      let peak = 0;

      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          for (let index = 0; index < data.length; index += 1) {
            const normalized = Math.abs((data[index] - 128) / 128);
            if (normalized > peak) peak = normalized;
          }

          if (performance.now() >= deadline) {
            resolve();
            return;
          }
          window.requestAnimationFrame(tick);
        };

        window.requestAnimationFrame(tick);
      });

      const percent = Math.round(Math.min(1, peak * 1.8) * 100);
      setScreenAudioSmokeStatus(
        percent > 3
          ? `Screen audio detected from ${audioTracks[0].label || "the shared source"}. Peak activity reached ${percent}%, so the browser/source combination is passing audio into capture.`
          : `A screen-audio track was returned from ${audioTracks[0].label || "the shared source"}, but activity stayed near silence. If sound was playing, the browser likely exposed a silent track or the chosen source was not the actual audio source.`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setScreenAudioSmokeStatus("Smoke test cancelled or blocked by permission settings. Re-run and allow screen sharing.");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        setScreenAudioSmokeStatus("No shareable screen source was found by the browser.");
      } else {
        setScreenAudioSmokeStatus(`Smoke test failed: ${error instanceof Error ? error.message : "capture failed"}`);
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      void testContext?.close();
      setScreenAudioSmokeTesting(false);
    }
  }, []);

  // Init offscreen canvases for segmentation
  useEffect(() => {
    if (!personCanvasRef.current) personCanvasRef.current = document.createElement("canvas");
    if (!maskCanvasRef.current) maskCanvasRef.current = document.createElement("canvas");
  }, []);

  // Load / release MediaPipe Selfie Segmenter when toggled
  useEffect(() => {
    let cancelled = false;
    if (!segmentEnabled) {
      if (segmenterRef.current) { try { segmenterRef.current.close(); } catch {} segmenterRef.current = null; }
      setSegmentReady(false);
      return;
    }
    (async () => {
      try {
        setSegmentLoading(true);
        setSegmentError(null);
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        if (cancelled) return;
        const seg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        if (cancelled) { try { seg.close(); } catch {} return; }
        segmenterRef.current = seg;
        setSegmentReady(true);
      } catch (e) {
        setSegmentError(e instanceof Error ? e.message : "segmenter init failed");
        setSegmentReady(false);
      } finally {
        if (!cancelled) setSegmentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (segmenterRef.current) { try { segmenterRef.current.close(); } catch {} segmenterRef.current = null; }
      setSegmentReady(false);
    };
  }, [segmentEnabled]);

  // Run segmentation on the webcam frame → produce personCanvas (video with alpha cutout) + head centroid
  const runSegmentation = (video: HTMLVideoElement) => {
    const seg = segmenterRef.current;
    const person = personCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!seg || !person || !maskC || segBusyRef.current) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    const now = performance.now();
    if (now - lastSegAtRef.current < 30) return; // cap ~33fps segmentation
    lastSegAtRef.current = now;
    segBusyRef.current = true;
    try {
      seg.segmentForVideo(video, now, (result) => {
        try {
          const mask: MPMask | undefined = result.categoryMask;
          if (!mask) return;
          const mw = mask.width, mh = mask.height;
          const arr = mask.getAsUint8Array();
          const invert = segmentInvertRef.current;
          // Build mask ImageData + centroid
          const img = new ImageData(mw, mh);
          const d = img.data;
          let sumX = 0, sumY = 0, cnt = 0;
          // Head estimation: use top 25% band of foreground pixels for centroid
          let topSumX = 0, topSumY = 0, topCnt = 0;
          const topBand = Math.floor(mh * 0.35);
          for (let y = 0; y < mh; y++) {
            for (let x = 0; x < mw; x++) {
              const i = y * mw + x;
              const raw = arr[i];
              const isPerson = invert ? raw === 0 : raw !== 0;
              const a = isPerson ? 255 : 0;
              const p = i * 4;
              d[p] = 255; d[p + 1] = 255; d[p + 2] = 255; d[p + 3] = a;
              if (isPerson) {
                sumX += x; sumY += y; cnt++;
                if (y < topBand) { topSumX += x; topSumY += y; topCnt++; }
              }
            }
          }
          if (topCnt > 200) {
            headPosRef.current = { x: topSumX / topCnt / mw, y: topSumY / topCnt / mh };
          } else if (cnt > 500) {
            headPosRef.current = { x: sumX / cnt / mw, y: sumY / cnt / mh };
          }
          // paint mask
          if (maskC.width !== mw || maskC.height !== mh) { maskC.width = mw; maskC.height = mh; }
          const mctx = maskC.getContext("2d");
          if (!mctx) return;
          mctx.putImageData(img, 0, 0);
          // feather via blur pass
          const feather = featherRef.current;
          // paint person canvas: video with mask as alpha
          const vw = video.videoWidth, vh = video.videoHeight;
          if (person.width !== vw || person.height !== vh) { person.width = vw; person.height = vh; }
          const pctx = person.getContext("2d");
          if (!pctx) return;
          pctx.save();
          pctx.clearRect(0, 0, vw, vh);
          if (feather > 0) {
            pctx.filter = `blur(${feather}px)`;
            pctx.drawImage(maskC, 0, 0, vw, vh);
            pctx.filter = "none";
          } else {
            pctx.drawImage(maskC, 0, 0, vw, vh);
          }
          pctx.globalCompositeOperation = "source-in";
          pctx.drawImage(video, 0, 0, vw, vh);
          pctx.restore();
        } finally {
          try { result.categoryMask?.close(); } catch {}
          segBusyRef.current = false;
        }
      });
    } catch {
      segBusyRef.current = false;
    }
  };



  const startScreen = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: true,
      });
      screenStreamRef.current = stream;
      const v = screenVideoRef.current!;
      v.srcObject = stream;
      await v.play();
      const track = stream.getVideoTracks()[0];
      const s = track.getSettings();
      const hasSharedAudio = stream.getAudioTracks().length > 0;
      setScreenMeta(`${track.label || "screen"} · ${s.width ?? "?"}×${s.height ?? "?"}${hasSharedAudio ? " · system audio" : ""}`);
      track.addEventListener("ended", () => {
        setScreenReady(false);
        setScreenMeta("");
        screenStreamRef.current = null;
      });
      setScreenReady(true);
    } catch (e: unknown) {
      setError(`Screen: ${e instanceof Error ? e.message : "capture failed"}`);
    }
  }, []);

  const startWebcam = useCallback(async (forcedDeviceId?: string) => {
    if (startingWebcam) return;
    setStartingWebcam(true);
    try {
      setError(null);
      const targetDeviceId = forcedDeviceId ?? selectedCameraDeviceId;
      const baseVideo: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
      };

      const preferredVideo: MediaTrackConstraints = targetDeviceId
        ? { ...baseVideo, deviceId: { exact: targetDeviceId } }
        : baseVideo;

      const preferredVideoSoft: MediaTrackConstraints = targetDeviceId
        ? { ...baseVideo, deviceId: { ideal: targetDeviceId } }
        : baseVideo;

      const requestedAudio: MediaTrackConstraints | boolean = selectedMicDeviceId === "none"
        ? false
        : selectedMicDeviceId
          ? { deviceId: { ideal: selectedMicDeviceId } }
          : true;

      const relaxedVideo: MediaTrackConstraints = targetDeviceId
        ? { deviceId: { exact: targetDeviceId } }
        : {};

      const cameraOnlyVideo: MediaTrackConstraints = targetDeviceId
        ? { deviceId: { exact: targetDeviceId } }
        : {};

      const webcamAttempts: Array<{ reason: string; constraints: MediaStreamConstraints }> = [
        { reason: "preferred constraints", constraints: { video: preferredVideo, audio: requestedAudio } },
      ];

      if (requestedAudio !== false) {
        webcamAttempts.push({ reason: "camera with auto mic", constraints: { video: preferredVideo, audio: true } });
      }
      webcamAttempts.push({ reason: "relaxed camera constraints", constraints: { video: relaxedVideo, audio: requestedAudio } });
      webcamAttempts.push({ reason: "camera only", constraints: { video: preferredVideo, audio: false } });
      webcamAttempts.push({ reason: "camera only relaxed", constraints: { video: cameraOnlyVideo, audio: false } });

      if (targetDeviceId) {
        webcamAttempts.push({ reason: "preferred camera soft", constraints: { video: preferredVideoSoft, audio: requestedAudio } });
        if (requestedAudio !== false) {
          webcamAttempts.push({ reason: "preferred camera soft + auto mic", constraints: { video: preferredVideoSoft, audio: true } });
        }
        webcamAttempts.push({ reason: "preferred camera soft only", constraints: { video: preferredVideoSoft, audio: false } });
        webcamAttempts.push({ reason: "default camera fallback", constraints: { video: baseVideo, audio: requestedAudio } });
        webcamAttempts.push({ reason: "any camera fallback", constraints: { video: true, audio: false } });
      }

      if (!targetDeviceId) {
        if (requestedAudio !== false) {
          webcamAttempts.push({ reason: "default camera + auto mic", constraints: { video: baseVideo, audio: true } });
        }
        webcamAttempts.push({ reason: "default camera only", constraints: { video: baseVideo, audio: false } });
        webcamAttempts.push({ reason: "any camera", constraints: { video: true, audio: false } });
      }

      let stream: MediaStream | null = null;
      let lastError: unknown = null;
      for (const attempt of webcamAttempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
          break;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }

      if (!stream) {
        throw lastError instanceof Error ? lastError : new Error("capture failed");
      }

      webcamStreamRef.current = stream;
      const v = webcamVideoRef.current!;
      v.srcObject = stream;
      await v.play();
      const track = stream.getVideoTracks()[0];
      const micTrack = stream.getAudioTracks()[0];
      const s = track.getSettings();
      const hasMic = stream.getAudioTracks().length > 0;
      setWebcamMeta(`${track.label || "camera"} · ${s.width ?? "?"}×${s.height ?? "?"}${hasMic ? " · mic live" : ""}`);
      setActiveCameraLabel(track.label || "Camera");
      setActiveMicLabel(micTrack?.label || "");
      if (!targetDeviceId && s.deviceId) setSelectedCameraDeviceId(s.deviceId);
      void refreshMediaDevices();
      track.addEventListener("ended", () => {
        setWebcamReady(false);
        setWebcamMeta("");
        setActiveCameraLabel("");
        setActiveMicLabel("");
      });
      setWebcamReady(true);
      toast.success(`Camera connected: ${track.label || "camera"}`);
    } catch (e: unknown) {
      const message = formatUserMediaError(e, "Camera");
      setError(`Webcam: ${message}`);
      toast.error(message);
    } finally {
      setStartingWebcam(false);
    }
  }, [refreshMediaDevices, selectedCameraDeviceId, selectedMicDeviceId, startingWebcam]);

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenReady(false);
    setScreenMeta("");
  }, []);
  const stopWebcam = useCallback(() => {
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current = null;
    setWebcamReady(false);
    setWebcamMeta("");
    setActiveCameraLabel("");
    setActiveMicLabel("");
  }, []);

  const handleCameraSourceChange = useCallback(async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextDeviceId = event.target.value;
    setSelectedCameraDeviceId(nextDeviceId);
    if (!webcamReady) return;

    stopWebcam();
    await startWebcam(nextDeviceId);
  }, [startWebcam, stopWebcam, webcamReady]);

  const applyMicSelectionToActiveWebcam = useCallback(async (nextMicDeviceId: string) => {
    const activeStream = webcamStreamRef.current;
    if (!activeStream) return;

    const existingAudioTracks = activeStream.getAudioTracks();
    if (nextMicDeviceId === "none") {
      existingAudioTracks.forEach((track) => {
        activeStream.removeTrack(track);
        track.stop();
      });
      setWebcamMeta((previous) => previous.replace(" · mic live", ""));
      setActiveMicLabel("None");
      await rebuildAudioMixer();
      toast.success("Microphone disabled");
      return;
    }

    try {
      const freshAudioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: nextMicDeviceId
          ? { deviceId: { ideal: nextMicDeviceId } }
          : true,
      });

      const nextTrack = freshAudioStream.getAudioTracks()[0];
      if (!nextTrack) {
        setError("Webcam: Selected microphone did not provide audio.");
        toast.error("Selected microphone did not provide audio");
        return;
      }

      existingAudioTracks.forEach((track) => {
        activeStream.removeTrack(track);
        track.stop();
      });
      activeStream.addTrack(nextTrack);
      setWebcamMeta((previous) => (previous.includes(" · mic live") ? previous : `${previous} · mic live`));
      setActiveMicLabel(nextTrack.label || "Mic");
      await rebuildAudioMixer();
      toast.success(`Mic switched: ${nextTrack.label || "default"}`);
    } catch (error) {
      const message = formatUserMediaError(error, "Microphone");
      setError(`Webcam: ${message}`);
      toast.error(message);
    }
  }, [rebuildAudioMixer]);

  const handleMicSourceChange = useCallback(async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextMicDeviceId = event.target.value;
    setSelectedMicDeviceId(nextMicDeviceId);
    if (!webcamReady) return;

    await applyMicSelectionToActiveWebcam(nextMicDeviceId);
  }, [applyMicSelectionToActiveWebcam, webcamReady]);

  const drawLayer = (
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource | null,
    t: Transform,
    opts: {
      rounded?: boolean; radius?: number; shadow?: boolean;
      shadowStrength?: number; shadowBlur?: number;
      glowColor?: string; parallaxDx?: number; parallaxDy?: number; parallaxRot?: number;
      fallbackSource?: CanvasImageSource | null;
      ready?: boolean;
    },
  ) => {
    const w = t.w * t.scale;
    const h = t.h * t.scale;
    const cx = t.x + t.w / 2 + (opts.parallaxDx ?? 0);
    const cy = t.y + t.h / 2 + (opts.parallaxDy ?? 0);

    ctx.save();
    ctx.globalAlpha = t.opacity;
    if (opts.shadow) {
      ctx.shadowColor = opts.glowColor ?? `rgba(0,0,0,${opts.shadowStrength ?? 0.55})`;
      ctx.shadowBlur = opts.shadowBlur ?? 60;
      ctx.shadowOffsetY = opts.glowColor ? 0 : 24;
    }
    ctx.translate(cx, cy);
    ctx.rotate(((t.rotation + (opts.parallaxRot ?? 0)) * Math.PI) / 180);
    const sx = Math.tan((t.tiltY * Math.PI) / 180);
    const sy = Math.tan((t.tiltX * Math.PI) / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);

    if (opts.rounded) {
      const r = Math.min(opts.radius ?? 24, w / 2, h / 2);
      const x = -w / 2;
      const y = -h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.clip();
    }
    let drew = false;
    if (source && opts.ready !== false) {
      try {
        ctx.drawImage(source, -w / 2, -h / 2, w, h);
        drew = true;
      } catch {
        // Continue into fallback source if available.
      }
    }
    if (!drew && opts.fallbackSource) {
      try {
        ctx.drawImage(opts.fallbackSource, -w / 2, -h / 2, w, h);
        drew = true;
      } catch {
        // Continue into no-signal placeholder.
      }
    }
    if (!drew) {
      ctx.fillStyle = "#111";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "600 28px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("no signal", 0, 0);
    }
    ctx.restore();
  };

  const captureLastGoodFrame = (
    source: CanvasImageSource | null,
    ready: boolean,
    cacheRef: React.MutableRefObject<HTMLCanvasElement | null>,
  ) => {
    if (!ready || !source) return;

    const width = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLCanvasElement ? source.width : 0;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLCanvasElement ? source.height : 0;
    if (width < 2 || height < 2) return;

    if (!cacheRef.current) {
      cacheRef.current = document.createElement("canvas");
    }
    const cache = cacheRef.current;
    if (cache.width !== width || cache.height !== height) {
      cache.width = width;
      cache.height = height;
    }
    const cacheCtx = cache.getContext("2d");
    if (!cacheCtx) return;
    try {
      cacheCtx.drawImage(source, 0, 0, width, height);
    } catch {
      // Ignore rare transient drawImage failures from unstable input frames.
    }
  };

  // Build a clip path matching a layer's transformed rounded rect.
  // Caller must ctx.save() before and ctx.restore() after.
  const clipToLayer = (
    ctx: CanvasRenderingContext2D, t: Transform, radius: number,
    parallax?: { dx: number; dy: number; rot: number },
  ) => {
    const w = t.w * t.scale;
    const h = t.h * t.scale;
    const cx = t.x + t.w / 2 + (parallax?.dx ?? 0);
    const cy = t.y + t.h / 2 + (parallax?.dy ?? 0);
    ctx.translate(cx, cy);
    ctx.rotate(((t.rotation + (parallax?.rot ?? 0)) * Math.PI) / 180);
    const sx = Math.tan((t.tiltY * Math.PI) / 180);
    const sy = Math.tan((t.tiltX * Math.PI) / 180);
    ctx.transform(1, sy, sx, 1, 0, 0);
    const r = Math.min(radius, w / 2, h / 2);
    const x = -w / 2, y = -h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.clip();
    // reset transform for subsequent world-space draws inside clip
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // snapshot helpers for pause
  const snapshotVideo = (v: HTMLVideoElement | null) => {
    if (!v || v.readyState < 2) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    const cx = c.getContext("2d");
    if (!cx) return null;
    cx.drawImage(v, 0, 0);
    return c;
  };
  const togglePauseScreen = () => {
    if (!screenPaused) screenFrozenRef.current = snapshotVideo(screenVideoRef.current);
    else screenFrozenRef.current = null;
    setScreenPaused((p) => !p);
  };
  const togglePauseWebcam = () => {
    if (!webcamPaused) webcamFrozenRef.current = snapshotVideo(webcamVideoRef.current);
    else webcamFrozenRef.current = null;
    setWebcamPaused((p) => !p);
  };
  const brbRestorePauseRef = useRef<{ screen: boolean; webcam: boolean } | null>(null);
  const setScreenPausedState = (next: boolean) => {
    if (next) {
      if (!screenPaused) screenFrozenRef.current = snapshotVideo(screenVideoRef.current);
    } else {
      screenFrozenRef.current = null;
    }
    setScreenPaused(next);
  };
  const setWebcamPausedState = (next: boolean) => {
    if (next) {
      if (!webcamPaused) webcamFrozenRef.current = snapshotVideo(webcamVideoRef.current);
    } else {
      webcamFrozenRef.current = null;
    }
    setWebcamPaused(next);
  };
  const toggleBrbMode = () => {
    if (!brbActive) {
      brbRestorePauseRef.current = { screen: screenPaused, webcam: webcamPaused };
      if (screenReady && !screenPaused) setScreenPausedState(true);
      if (webcamReady && !webcamPaused) setWebcamPausedState(true);
      setBrbActive(true);
      return;
    }

    setBrbActive(false);
    const restore = brbRestorePauseRef.current;
    brbRestorePauseRef.current = null;
    if (!restore) return;
    if (restore.screen !== screenPaused) setScreenPausedState(restore.screen);
    if (restore.webcam !== webcamPaused) setWebcamPausedState(restore.webcam);
  };

  const drawTeleprompter = (ctx: CanvasRenderingContext2D, dt: number) => {
    const teleState = teleprompterStateRef.current;
    if (!teleState.isVisible || !teleState.script.trim()) return;

    const panelX = CANVAS_W * 0.14;
    const panelY = CANVAS_H * 0.1;
    const panelW = CANVAS_W * 0.72;
    const panelH = CANVAS_H * 0.8;
    const padding = 56;
    const fontSize = teleState.fontSize * 2.3;
    const lineHeight = fontSize * 1.42;

    if (teleState.isAutoScrolling) {
      teleprompterOffsetRef.current += dt * teleState.scrollSpeed * 0.035;
    }

    ctx.save();
    ctx.fillStyle = `rgba(2, 4, 10, ${Math.max(0.12, teleState.opacity / 180)})`;
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.beginPath();
    ctx.rect(panelX + padding, panelY + padding, panelW - padding * 2, panelH - padding * 2);
    ctx.clip();

    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, teleState.opacity / 85)})`;

    const words = teleState.script.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = "";
    const maxWidth = panelW - padding * 2;
    for (const word of words) {
      const trial = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(trial).width <= maxWidth) {
        currentLine = trial;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    const contentHeight = lines.length * lineHeight;
    const maxOffset = Math.max(0, contentHeight - (panelH - padding * 2));
    if (teleprompterOffsetRef.current > maxOffset) {
      teleprompterOffsetRef.current = maxOffset;
      if (teleState.isAutoScrolling) {
        teleprompter.toggleAutoScroll();
      }
    }

    let y = panelY + padding - teleprompterOffsetRef.current;
    const centerX = panelX + panelW / 2;
    for (const line of lines) {
      ctx.fillText(line, centerX, y);
      y += lineHeight;
    }
    ctx.restore();

    ctx.save();
    const fade = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
    fade.addColorStop(0, "rgba(5, 6, 10, 0.98)");
    fade.addColorStop(0.08, "rgba(5, 6, 10, 0)");
    fade.addColorStop(0.92, "rgba(5, 6, 10, 0)");
    fade.addColorStop(1, "rgba(5, 6, 10, 0.98)");
    ctx.fillStyle = fade;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.restore();
  };

  const drawLogoOverlay = (ctx: CanvasRenderingContext2D) => {
    const image = logoImageRef.current;
    if (!image || !logo.config.url) return;

    const margin = 36;
    const width = logo.config.size * 2.4;
    const height = width * (image.naturalHeight / image.naturalWidth || 1);
    let x = margin;
    let y = margin;
    if (logo.config.position.includes("right")) x = CANVAS_W - width - margin;
    if (logo.config.position.includes("bottom")) y = CANVAS_H - height - margin;

    ctx.save();
    ctx.globalAlpha = logo.config.opacity / 100;
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 20;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  };

  const drawSocialOverlay = (ctx: CanvasRenderingContext2D) => {
    const visibleLinks = overlays.settings.socialLinks.filter((link) => link.visible && link.handle.trim());
    if (!visibleLinks.length) return;

    const positionY = overlays.settings.position === "top" ? 36 : CANVAS_H - 112;
    const pillHeight = 52;
    const gap = 18;
    const font = "600 28px Inter, system-ui, sans-serif";
    ctx.save();
    ctx.font = font;

    const labels = visibleLinks.map((link) => {
      const prefix = link.platform === "cashapp" ? "$" : "@";
      return `${prefix}${link.handle.replace(/^[@$]/, "")}`;
    });
    const widths = labels.map((label) => Math.max(160, ctx.measureText(label).width + 74));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
    let x = (CANVAS_W - totalWidth) / 2;

    visibleLinks.forEach((link, index) => {
      const width = widths[index];
      const label = labels[index];
      if (overlays.settings.showBackground) {
        ctx.fillStyle = overlays.settings.backgroundColor || "rgba(0,0,0,0.7)";
        roundRect(ctx, x, positionY, width, pillHeight, 18);
        ctx.fill();
      }

      ctx.fillStyle = overlays.settings.textColor || "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(link.platform === "custom" ? "LINK" : link.platform.toUpperCase(), x + 18, positionY + pillHeight / 2);
      ctx.fillText(label, x + 18 + 110, positionY + pillHeight / 2);
      x += width + gap;
    });

    ctx.restore();
  };

  const handleTeleprompterReset = () => {
    teleprompterOffsetRef.current = 0;
    teleprompter.resetScroll();
  };

  const setCaptureField = <K extends keyof LocalCaptureConfig>(key: K, value: LocalCaptureConfig[K]) => {
    setCaptureConfig((prev) => normalizeCaptureConfig({ ...prev, [key]: value }));
  };

  const syncCaptureToScreenLayer = useCallback(() => {
    const scaleX = captureConfig.displayW / CANVAS_W;
    const scaleY = captureConfig.displayH / CANVAS_H;
    setCaptureConfig((prev) => normalizeCaptureConfig({
      ...prev,
      x: Math.round(screenState.x * scaleX),
      y: Math.round(screenState.y * scaleY),
      w: Math.round(screenState.w * scaleX),
      h: Math.round(screenState.h * scaleY),
    }));
    toast.success("Capture region synced from current screen layer");
  }, [captureConfig.displayH, captureConfig.displayW, screenState.h, screenState.w, screenState.x, screenState.y]);

  const copyCaptureSetup = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateLocalCaptureSetup(captureConfig));
      toast.success("Capture setup copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, [captureConfig]);

  const downloadCaptureKit = useCallback(async (platform: "mac" | "win") => {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const folder = zip.folder(platform === "mac" ? "Parallax Local Capture (Mac)" : "Parallax Local Capture (Windows)");
      if (!folder) throw new Error("Unable to create kit folder");

      for (const file of generateLocalCaptureFiles(captureConfig, platform)) {
        folder.file(file.filename, file.body, file.filename.endsWith(".command") ? { unixPermissions: 0o755 } : undefined);
      }

      const blob = await zip.generateAsync({ type: "blob", platform: "UNIX" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = platform === "mac" ? "parallax-local-capture-mac.zip" : "parallax-local-capture-windows.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(platform === "mac" ? "Downloaded Mac capture kit" : "Downloaded Windows capture kit");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build capture kit");
    }
  }, [captureConfig]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastT = performance.now();
    let frames = 0;
    let fpsAcc = 0;
    let maxFrame = 0;
    let slowStreak = 0;
    let lastQualityShift = performance.now();

    const loop = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      frames++;
      fpsAcc += dt;
      if (dt > maxFrame) maxFrame = dt;

      if (fpsAcc >= 500) {
        const currentFps = Math.round((frames * 1000) / fpsAcc);
        setFps(currentFps);
        setFrameMs(Math.round(maxFrame));

        // Auto-quality scaling
        if (autoQuality) {
          const q = qualityRef.current;
          const now2 = performance.now();
          if (currentFps < 24 && q !== "low" && now2 - lastQualityShift > 2500) {
            slowStreak++;
            if (slowStreak >= 2) {
              setQuality(q === "high" ? "medium" : "low");
              setPerfWarn(`Auto-reduced quality to ${q === "high" ? "medium" : "low"} (fps ${currentFps})`);
              lastQualityShift = now2;
              slowStreak = 0;
            }
          } else if (currentFps > 55 && q !== "high" && now2 - lastQualityShift > 6000) {
            setQuality(q === "low" ? "medium" : "high");
            lastQualityShift = now2;
            slowStreak = 0;
          } else {
            slowStreak = Math.max(0, slowStreak - 1);
          }
        }

        frames = 0;
        fpsAcc = 0;
        maxFrame = 0;
      }

      const qs = QUALITY_SETTINGS[qualityRef.current];
      const tSec = now / 1000;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "none";
      ctx.shadowColor = "rgba(0,0,0,0)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // background
      const bgImg = customBgImgRef.current;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        // cover-fit custom image
        const ir = bgImg.naturalWidth / bgImg.naturalHeight;
        const cr = CANVAS_W / CANVAS_H;
        let dw = CANVAS_W, dh = CANVAS_H, dx = 0, dy = 0;
        if (ir > cr) { dh = CANVAS_H; dw = dh * ir; dx = (CANVAS_W - dw) / 2; }
        else { dw = CANVAS_W; dh = dw / ir; dy = (CANVAS_H - dh) / 2; }
        try { ctx.drawImage(bgImg, dx, dy, dw, dh); } catch {}
      } else if (bgTone === "black") {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      } else if (bgTone === "studio") {
        const g = ctx.createRadialGradient(
          CANVAS_W / 2, CANVAS_H / 2, 100,
          CANVAS_W / 2, CANVAS_H / 2, 1200,
        );
        g.addColorStop(0, "#1a1d29");
        g.addColorStop(1, "#05060a");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      } else if (bgTone === "aurora") {
        ctx.fillStyle = "#04050a";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const a1 = ctx.createRadialGradient(
          CANVAS_W * (0.3 + Math.sin(tSec * 0.15) * 0.05), CANVAS_H * 0.4, 40,
          CANVAS_W * 0.3, CANVAS_H * 0.4, 900,
        );
        a1.addColorStop(0, "rgba(99,102,241,0.55)");
        a1.addColorStop(1, "rgba(99,102,241,0)");
        ctx.fillStyle = a1;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const a2 = ctx.createRadialGradient(
          CANVAS_W * (0.75 + Math.cos(tSec * 0.2) * 0.05), CANVAS_H * 0.7, 40,
          CANVAS_W * 0.75, CANVAS_H * 0.7, 900,
        );
        a2.addColorStop(0, "rgba(236,72,153,0.45)");
        a2.addColorStop(1, "rgba(236,72,153,0)");
        ctx.fillStyle = a2;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      } else {
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let x = 0; x < CANVAS_W; x += 80) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
        }
        for (let y = 0; y < CANVAS_H; y += 80) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
        }
      }

      // Kick segmentation on live webcam every loop (throttled inside)
      const wvLive = webcamVideoRef.current;
      if (segmentEnabledRef.current && !webcamPaused && wvLive && segmenterRef.current) {
        runSegmentation(wvLive);
      }

      // Smooth head position → screen parallax
      const hp = headPosRef.current;
      const hs = headSmoothRef.current;
      const alpha = 0.15;
      hs.x = hs.x + (hp.x - hs.x) * alpha;
      hs.y = hs.y + (hp.y - hs.y) * alpha;

      // Auto parallax breathing — subtle drift on screen layer
      const breathe = autoParallaxRef.current
        ? { dx: Math.sin(tSec * 0.5) * 6, dy: Math.cos(tSec * 0.4) * 4, rot: Math.sin(tSec * 0.3) * 0.4 }
        : { dx: 0, dy: 0, rot: 0 };
      // Face-driven parallax — invert x (webcam is mirrored feel), amplify small movements
      const facePar = (segmentEnabledRef.current && faceParallaxRef.current)
        ? {
            dx: -(hs.x - 0.5) * 2 * parallaxStrengthRef.current,
            dy: (hs.y - 0.5) * 2 * parallaxStrengthRef.current * 0.6,
            rot: -(hs.x - 0.5) * 4,
          }
        : { dx: 0, dy: 0, rot: 0 };
      const parallax = {
        dx: breathe.dx + facePar.dx,
        dy: breathe.dy + facePar.dy,
        rot: breathe.rot + facePar.rot,
      };

      const useSegmentedWebcam = segmentEnabledRef.current && !webcamPaused && !!personCanvasRef.current;
      const modeClipped = useSegmentedWebcam && segmentModeRef.current === "screen-clipped";

      const sv = screenVideoRef.current;
      const wv = webcamVideoRef.current;
      const screenSrc: CanvasImageSource | null = screenPaused ? screenFrozenRef.current : sv;
      const screenReady2 = screenPaused ? !!screenFrozenRef.current : !!sv && sv.readyState >= 2;
      const rawWebcamSrc: CanvasImageSource | null = webcamPaused ? webcamFrozenRef.current : wv;
      const rawWebcamReady = webcamPaused ? !!webcamFrozenRef.current : !!wv && wv.readyState >= 2;

      captureLastGoodFrame(screenSrc, screenReady2, lastScreenFrameRef);
      captureLastGoodFrame(rawWebcamSrc, rawWebcamReady, lastWebcamFrameRef);

      const effectiveScreenSrc = screenReady2 ? screenSrc : lastScreenFrameRef.current;
      const effectiveScreenReady = screenReady2 || !!lastScreenFrameRef.current;
      const effectiveWebcamSrc = rawWebcamReady ? rawWebcamSrc : lastWebcamFrameRef.current;
      const effectiveWebcamReady = rawWebcamReady || !!lastWebcamFrameRef.current;

      const personSrc = personCanvasRef.current;
      const personReady = !!(personSrc && personSrc.width > 0);

      const drawScreen = () => drawLayer(ctx, effectiveScreenSrc, screenT.current, {
        rounded: false, radius: 0,
        shadow: false, shadowStrength: 0.6, shadowBlur: qs.shadowBlur,
        parallaxDx: parallax.dx, parallaxDy: parallax.dy, parallaxRot: parallax.rot,
        fallbackSource: lastScreenFrameRef.current,
        ready: effectiveScreenReady,
      });
      const drawWebcamRaw = () => {
        if (cinematicRef.current && shadow) {
          drawLayer(ctx, null, webcamT.current, {
            rounded, radius: roundedRadius,
            shadow: true, shadowBlur: 90,
            glowColor: "rgba(120,140,255,0.55)", ready: false,
          });
        }
        drawLayer(ctx, effectiveWebcamSrc, webcamT.current, {
          rounded, radius: roundedRadius,
          shadow, shadowStrength: 0.75, shadowBlur: qs.shadowBlur,
          fallbackSource: lastWebcamFrameRef.current,
          ready: effectiveWebcamReady,
        });
      };
      const drawWebcamCutout = () => drawLayer(ctx, personSrc, webcamT.current, {
        rounded: false, radius: roundedRadius,
        shadow: false, ready: personReady,
      });

      if (modeClipped) {
        // Respect user-selected layer order even when behind-head clipping is active.
        for (const key of order) {
          if (key === "screen") drawScreen();
          else drawWebcamRaw();
        }
        // (c) Person cutout, clipped to screen's transformed rounded rect —
        //     silhouette only pushes through where it overlaps the screen
        if (personReady) {
          ctx.save();
          clipToLayer(ctx, screenT.current, 18, parallax);
          drawWebcamCutout();
          ctx.restore();
        }
      } else if (useSegmentedWebcam) {
        // Full cutout: screen behind, silhouette in front (no background)
        drawScreen();
        drawWebcamCutout();
      } else {
        // No segmentation — normal ordered rectangles
        for (const key of order) {
          if (key === "screen") drawScreen();
          else drawWebcamRaw();
        }
      }
      // BRB overlay
      if (brbActive) {
        ctx.save();
        ctx.fillStyle = "rgba(4,6,14,0.97)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        const pulse = 0.85 + Math.sin(tSec * 2) * 0.15;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "800 140px system-ui, -apple-system, sans-serif";
        ctx.shadowColor = "rgba(120,140,255,0.9)";
        ctx.shadowBlur = 60;
        ctx.fillText(brbText || "BE RIGHT BACK", CANVAS_W / 2, CANVAS_H / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.75;
        ctx.font = "400 34px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#c7d0ff";
        ctx.fillText(brbSubtext || "", CANVAS_W / 2, CANVAS_H / 2 + 80);
        // spinner dots
        for (let i = 0; i < 3; i++) {
          const a = (Math.sin(tSec * 3 - i * 0.6) + 1) / 2;
          ctx.globalAlpha = 0.3 + a * 0.7;
          ctx.beginPath();
          ctx.arc(CANVAS_W / 2 - 40 + i * 40, CANVAS_H / 2 + 160, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (!brbActive) {
        drawSocialOverlay(ctx);
        drawTeleprompter(ctx, dt);
      }
      drawLogoOverlay(ctx);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shadow, rounded, roundedRadius, bgTone, order, autoQuality, screenPaused, webcamPaused, brbActive, brbText, brbSubtext, teleprompter, logo.config, overlays.settings]);

  // recording timer
  useEffect(() => {
    if (!recording || recStart === null) return;
    const id = setInterval(() => setRecElapsed(Date.now() - recStart), 250);
    return () => clearInterval(id);
  }, [recording, recStart]);

  const dragRef = useRef<DragState>(null);

  const overlayToCanvas = (clientX: number, clientY: number) => {
    const el = overlayRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const snap = (v: number) => (snapRef.current ? Math.round(v / GRID_SIZE) * GRID_SIZE : v);

  const commitTransform = (layer: LayerKey, t: Transform) => {
    if (layer === "screen") {
      screenT.current = t;
      setScreenState(t);
    } else {
      webcamT.current = t;
      setWebcamState(t);
    }
  };

  const onPointerDownLayer = (
    e: React.PointerEvent,
    layer: LayerKey,
    mode: "move" | "resize" | "rotate",
    corner?: "nw" | "ne" | "sw" | "se",
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelected(layer);
    const p = overlayToCanvas(e.clientX, e.clientY);
    const cur = layer === "screen" ? screenT.current : webcamT.current;
    if (mode === "move") {
      dragRef.current = { type: "move", layer, startX: p.x, startY: p.y, origX: cur.x, origY: cur.y };
    } else if (mode === "resize") {
      dragRef.current = {
        type: "resize", layer, corner: corner!,
        startX: p.x, startY: p.y, orig: { ...cur },
      };
    } else {
      const cx = cur.x + cur.w / 2;
      const cy = cur.y + cur.h / 2;
      dragRef.current = {
        type: "rotate", layer, cx, cy,
        startAngle: Math.atan2(p.y - cy, p.x - cx),
        origRot: cur.rotation,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = overlayToCanvas(e.clientX, e.clientY);
    if (d.type === "move") {
      const cur = d.layer === "screen" ? screenT.current : webcamT.current;
      commitTransform(d.layer, {
        ...cur,
        x: snap(d.origX + (p.x - d.startX)),
        y: snap(d.origY + (p.y - d.startY)),
      });
    } else if (d.type === "resize") {
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      const o = d.orig;
      let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (d.corner === "se") { nw = Math.max(80, o.w + dx); nh = Math.max(60, o.h + dy); }
      else if (d.corner === "sw") { nw = Math.max(80, o.w - dx); nh = Math.max(60, o.h + dy); nx = o.x + (o.w - nw); }
      else if (d.corner === "ne") { nw = Math.max(80, o.w + dx); nh = Math.max(60, o.h - dy); ny = o.y + (o.h - nh); }
      else { nw = Math.max(80, o.w - dx); nh = Math.max(60, o.h - dy); nx = o.x + (o.w - nw); ny = o.y + (o.h - nh); }
      if (e.shiftKey) { const ar = o.w / o.h; nh = nw / ar; }
      commitTransform(d.layer, { ...o, x: snap(nx), y: snap(ny), w: snap(nw), h: snap(nh) });
    } else if (d.type === "rotate") {
      const a = Math.atan2(p.y - d.cy, p.x - d.cx);
      let deg = d.origRot + ((a - d.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      const cur = d.layer === "screen" ? screenT.current : webcamT.current;
      commitTransform(d.layer, { ...cur, rotation: deg });
    }
  };

  const onPointerUp = () => { dragRef.current = null; };

  // Hotkey nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const step = e.shiftKey ? 20 : e.altKey ? 1 : 5;
      const cur = selected === "screen" ? screenT.current : webcamT.current;
      if (e.key === "ArrowLeft") { commitTransform(selected, { ...cur, x: cur.x - step }); e.preventDefault(); }
      else if (e.key === "ArrowRight") { commitTransform(selected, { ...cur, x: cur.x + step }); e.preventDefault(); }
      else if (e.key === "ArrowUp") { commitTransform(selected, { ...cur, y: cur.y - step }); e.preventDefault(); }
      else if (e.key === "ArrowDown") { commitTransform(selected, { ...cur, y: cur.y + step }); e.preventDefault(); }
      else if (e.key === "[") { commitTransform(selected, { ...cur, rotation: cur.rotation - (e.shiftKey ? 5 : 1) }); }
      else if (e.key === "]") { commitTransform(selected, { ...cur, rotation: cur.rotation + (e.shiftKey ? 5 : 1) }); }
      else if (e.key === "Tab") { setSelected((s) => (s === "screen" ? "webcam" : "screen")); e.preventDefault(); }
      else if (e.key === "b" || e.key === "B") { toggleBrbMode(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Alt = click-through the topmost visual layer (grab layer underneath)
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Alt") setAltHeld(true); };
    const up   = (e: KeyboardEvent) => { if (e.key === "Alt") setAltHeld(false); };
    const blur = () => setAltHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ================ Streaming (local FFmpeg bridge → RTMP) ================
  const startStream = useCallback(async () => {
    setStreamStatus("");
    if (!streamUrl.trim() || !streamKey.trim()) {
      setStreamStatus("Enter Stream URL and Stream Key");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) { setStreamStatus("Canvas not ready"); return; }
    const stream = canvas.captureStream(streamFps);
    appendMixedAudioTracks(stream);
    const mime = getPreferredRecorderMimeType(["video/webm;codecs=vp8,opus", "video/webm"]);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: streamBitrate * 1000,
        audioBitsPerSecond: 256_000,
      });
    } catch (e) {
      setStreamStatus("MediaRecorder init failed: " + (e instanceof Error ? e.message : "unknown"));
      return;
    }
    streamRecRef.current = rec;

    let pushChunk: ((u8: Uint8Array) => void) | null = null;
    let closeStream: (() => void) | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        pushChunk = (u8) => { try { controller.enqueue(u8); } catch {} };
        closeStream = () => { try { controller.close(); } catch {} };
      },
    });

    rec.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const buf = new Uint8Array(await e.data.arrayBuffer());
      pushChunk?.(buf);
    };
    rec.onstop = () => { closeStream?.(); };
    rec.onerror = (ev) => { setStreamStatus("Recorder error: " + String(ev)); };

    const q = new URLSearchParams({
      url: streamUrl.trim(),
      key: streamKey.trim(),
      bitrate: String(streamBitrate),
      keyframe: String(streamKeyframe),
      fps: String(streamFps),
    });
    const ingest = `http://localhost:${bridgePort}/ingest?${q.toString()}`;
    const ac = new AbortController();
    streamAbortRef.current = ac;
    rec.start(500);
    setStreaming(true);
    setStreamStatus(`connecting → ${ingest}`);
    try {
      // Chrome requires duplex:'half' for streaming request bodies
      const res = await fetch(ingest, {
        method: "POST",
        body,
        signal: ac.signal,
        // @ts-expect-error chrome-only streaming body option
        duplex: "half",
        headers: { "Content-Type": "video/webm" },
      });
      setStreamStatus(`bridge: ${res.status} ${res.statusText || ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      if (!msg.includes("aborted")) {
        setStreamStatus(
          `Bridge unreachable on :${bridgePort}. Run the local bridge (see Streaming panel) or use cloud fallback.`,
        );
      }
    } finally {
      try { rec.state !== "inactive" && rec.stop(); } catch {}
      setStreaming(false);
      streamRecRef.current = null;
      streamAbortRef.current = null;
    }
  }, [appendMixedAudioTracks, streamUrl, streamKey, streamBitrate, streamFps, streamKeyframe, bridgePort]);

  const stopStream = useCallback(() => {
    try { streamRecRef.current?.stop(); } catch {}
    try { streamAbortRef.current?.abort(); } catch {}
    setStreaming(false);
    setStreamStatus("stopped");
  }, []);

  const downloadBridgeScript = useCallback(() => {
    const script = String.raw`#!/usr/bin/env node
// parallax-bridge.js — local RTMP push bridge for Parallax Studio.
//
// Prereqs (macOS):  brew install ffmpeg node
// Prereqs (Linux):  sudo apt install ffmpeg nodejs
// Prereqs (Win):    install ffmpeg + Node.js, add to PATH.
//
// Run:              node parallax-bridge.js
// The bridge listens on http://localhost:${bridgePort} and pipes the WebM
// stream from your browser into ffmpeg, which re-encodes to H.264/AAC and
// pushes to your RTMP endpoint (Kick, Twitch, YouTube, Restream, etc).
//
// Kick: Stream URL is  rtmps://fa723fc1b171.global-contribute.live-video.net/app/
//       Stream Key comes from your Kick dashboard.
//
// Security: only bind localhost. Do NOT expose to the internet.

const http = require('http');
const { spawn } = require('child_process');
const PORT = ${bridgePort};

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST' || !req.url.startsWith('/ingest')) {
    res.writeHead(404); res.end('parallax bridge — POST /ingest'); return;
  }
  const u = new URL(req.url, 'http://localhost');
  const rtmpUrl  = u.searchParams.get('url');
  const streamKey = u.searchParams.get('key');
  const bitrate  = u.searchParams.get('bitrate')  || '6000';
  const kf       = u.searchParams.get('keyframe') || '2';
  const fps      = u.searchParams.get('fps')      || '60';
  if (!rtmpUrl || !streamKey) { res.writeHead(400); res.end('missing url/key'); return; }
  const dest = rtmpUrl.replace(/\/+$/, '') + '/' + streamKey;
  console.log('[bridge]', new Date().toISOString(), 'streaming →', dest.replace(streamKey, '***'));
  const args = [
    '-hide_banner', '-loglevel', 'warning',
    '-fflags', '+genpts', '-re',
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
    '-b:v', bitrate + 'k', '-maxrate', bitrate + 'k', '-bufsize', (Number(bitrate) * 2) + 'k',
    '-g', String(Number(fps) * Number(kf)), '-keyint_min', String(Number(fps) * Number(kf)),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
    '-f', 'flv', dest,
  ];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  req.pipe(ff.stdin);
  const cleanup = (why) => { console.log('[bridge] cleanup:', why); try { ff.stdin.end(); } catch {} };
  req.on('end',   () => cleanup('client end'));
  req.on('close', () => cleanup('client close'));
  req.on('error', (e) => cleanup('client error ' + e.message));
  ff.on('exit', (code) => { console.log('[bridge] ffmpeg exit', code); try { res.end('ok'); } catch {} });
}).listen(PORT, '127.0.0.1', () => {
  console.log('parallax-bridge listening on http://localhost:' + PORT);
  console.log('point your browser Streaming panel at this port and hit "Go Live".');
});
`;
    const blob = new Blob([script], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parallax-bridge.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [bridgePort]);


  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const recordingProfile = getRecordingProfile(CANVAS_W, CANVAS_H, RECORDING_CAPTURE_FPS, recordingQualityPreset);
    const stream = canvas.captureStream(recordingProfile.fps);
    appendMixedAudioTracks(stream);
    const rec = new MediaRecorder(stream, {
      ...(recordingProfile.mimeType ? { mimeType: recordingProfile.mimeType } : {}),
      videoBitsPerSecond: recordingProfile.videoBitsPerSecond,
      audioBitsPerSecond: recordingProfile.audioBitsPerSecond,
    });
    recordedChunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && recordedChunksRef.current.push(e.data);
    rec.onstop = () => {
      void (async () => {
        if (recordedChunksRef.current.length < 1) {
          toast.error("Recording finished with no media data. Try a longer take and retry.");
          return;
        }
        const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || recordingProfile.mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        const thumbnail = await createThumbnailFromBlob(blob);
        const recording: Recording = {
          id: `parallax-${Date.now()}`,
          blob,
          url,
          duration: Math.floor(recElapsedRef.current / 1000),
          createdAt: new Date(),
          thumbnail,
        };
        addRecording(recording);
        toast.success("Recording saved to gallery");
      })();
    };
    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
    setRecStart(Date.now());
    setRecElapsed(0);
  }, [addRecording, appendMixedAudioTracks, recordingQualityPreset]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecStart(null);
  }, []);

  useEffect(() => () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current?.stop();
    micSourceRef.current?.disconnect();
    screenAudioSourceRef.current?.disconnect();
    micGainRef.current?.disconnect();
    screenAudioGainRef.current?.disconnect();
    void audioContextRef.current?.close();
  }, []);

  const layer = selected === "screen" ? screenState : webcamState;
  const setField = <K extends keyof Transform>(k: K, v: Transform[K]) => {
    const cur = selected === "screen" ? screenT.current : webcamT.current;
    commitTransform(selected, { ...cur, [k]: v });
  };
  const resetLayer = () => {
    commitTransform(selected, selected === "screen" ? defaultScreen : defaultWebcam);
  };
  const swapOrder = () => setOrder((o) => [o[1], o[0]]);

  const applyScreenLeadLayout = () => {
    commitTransform("screen", { ...defaultScreen });
    commitTransform("webcam", { ...defaultWebcam });
    setOrder(["screen", "webcam"]);
    setSelected("screen");
  };

  const applyWebcamLeadLayout = () => {
    commitTransform("webcam", {
      x: -80,
      y: -45,
      w: 2080,
      h: 1170,
      rotation: 0,
      tiltX: 0,
      tiltY: 0,
      opacity: 1,
      scale: 1,
    });
    commitTransform("screen", {
      x: 1160,
      y: 640,
      w: 680,
      h: 382,
      rotation: -8,
      tiltX: 10,
      tiltY: -14,
      opacity: 0.95,
      scale: 1,
    });
    setOrder(["webcam", "screen"]);
    setSelected("screen");
  };

  const toggleLeadLayout = () => {
    const screenArea = screenT.current.w * screenT.current.h;
    const webcamArea = webcamT.current.w * webcamT.current.h;
    if (screenArea >= webcamArea) applyWebcamLeadLayout();
    else applyScreenLeadLayout();
  };

  const toggleBehindHeadFx = () => {
    const active = segmentEnabled && segmentMode === "screen-clipped";
    if (active) {
      setSegmentEnabled(false);
      toast.success("Behind-head effect off");
      return;
    }
    setSegmentEnabled(true);
    setSegmentMode("screen-clipped");
    setSegmentInvert(true);
    setFaceParallax(true);
    setAutoParallax(true);
    applyWebcamLeadLayout();
    toast.success("Behind-head effect on");
  };

  // Presets
  const savePreset = (nameOverride?: string) => {
    const name = (nameOverride ?? presetName).trim() || `Scene ${presets.length + 1}`;
    const preset: Preset = {
      id: `p_${Date.now()}`,
      name,
      screen: { ...screenT.current },
      webcam: { ...webcamT.current },
      order: [...order],
      bgTone, shadow, rounded, roundedRadius,
      createdAt: Date.now(),
    };
    persistPresets([preset, ...presets]);
    setPresetName("");
    toast.success(`Saved preset: ${name}`);
  };
  const quickSavePreset = () => {
    savePreset(presetName.trim() || `Scene ${presets.length + 1}`);
  };
  const loadPreset = (p: Preset) => {
    commitTransform("screen", p.screen);
    commitTransform("webcam", p.webcam);
    setOrder(p.order);
    setBgTone(p.bgTone);
    setShadow(p.shadow);
    setRounded(p.rounded);
    setRoundedRadius(p.roundedRadius);
  };
  const deletePreset = (id: string) => persistPresets(presets.filter((p) => p.id !== id));
  const exportPresets = () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parallax-presets-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importPresets = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) {
          persistPresets([...data, ...presets]);
          toast.success(`Imported ${data.length} presets`);
        }
      } catch {
        setError("Preset import failed: invalid JSON");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const fpsState: "good" | "warn" | "bad" =
    fps >= 50 ? "good" : fps >= 30 ? "warn" : "bad";
  const fpsColor = fpsState === "good" ? "bg-emerald-500" : fpsState === "warn" ? "bg-amber-500" : "bg-red-500";
  const recordingProfile = useMemo(
    () => getRecordingProfile(CANVAS_W, CANVAS_H, RECORDING_CAPTURE_FPS, recordingQualityPreset),
    [recordingQualityPreset],
  );

  const outOfSafe = useMemo(() => {
    const bad = (t: Transform) =>
      t.x < SAFE_MARGIN ||
      t.y < SAFE_MARGIN ||
      t.x + t.w > CANVAS_W - SAFE_MARGIN ||
      t.y + t.h > CANVAS_H - SAFE_MARGIN;
    return { screen: bad(screenState), webcam: bad(webcamState) };
  }, [screenState, webcamState]);

  const recSecs = Math.floor(recElapsed / 1000);
  const recLabel = `${String(Math.floor(recSecs / 60)).padStart(2, "0")}:${String(recSecs % 60).padStart(2, "0")}`;
  const sectionClassName = "rounded-[28px] border border-white/10 bg-black/25 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl";
  const quickCardClassName = "rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]";
  const heroCardClassName = "rounded-[32px] border border-white/10 bg-[linear-gradient(145deg,rgba(10,12,18,0.96),rgba(10,12,18,0.8))] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl";
  const sourceReadyCount = Number(screenReady) + Number(webcamReady);
  const studioModeLabel = recording ? "Recording" : streaming ? "Live" : sourceReadyCount > 0 ? "Ready" : "Standby";
  const studioModeTone = recording
    ? "bg-destructive text-destructive-foreground"
    : streaming
      ? "bg-emerald-500 text-black"
      : sourceReadyCount > 0
        ? "bg-primary text-primary-foreground"
        : "bg-white/10 text-muted-foreground";
  const sourceSummary = sourceReadyCount === 2 ? "screen + cam armed" : sourceReadyCount === 1 ? "one source armed" : "no live source yet";
  const recordingSummary = `${recordingProfile.width}×${recordingProfile.height} · ${recordingProfile.fps}fps · ${formatMegabits(recordingProfile.videoBitsPerSecond)}`;
  const streamSummary = `${streamFps}fps · ${(streamBitrate / 1000).toFixed(1)} Mbps bridge target`;
  const frontLayer = order[1];
  const needsQuickStart =
    !quickStartDismissed &&
    !screenReady &&
    !webcamReady &&
    !recording &&
    !streaming &&
    recordings.length === 0 &&
    !teleprompter.state.script.trim() &&
    !logo.hasLogo;
  const studioControlSections = (
    <>
      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</h2>
        <div className="flex gap-1">
          <button
            onClick={screenReady ? stopScreen : startScreen}
            className={`flex-1 text-sm rounded-md px-3 py-2 border transition ${
              screenReady ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"
            }`}
          >
            {screenReady ? "Stop Screen" : "Share Screen"}
          </button>
          <button
            onClick={togglePauseScreen}
            disabled={!screenReady && !screenPaused}
            title="Freeze / resume screen"
            className={`text-xs rounded-md px-2 border transition disabled:opacity-40 ${
              screenPaused ? "bg-amber-500 text-black border-amber-500" : "bg-card hover:bg-accent border-border"
            }`}
          >
            {screenPaused ? "▶" : "❚❚"}
          </button>
        </div>
        {screenMeta && <p className="text-[10px] text-muted-foreground truncate" title={screenMeta}>{screenMeta}{screenPaused && " · PAUSED"}</p>}
        <div className="flex gap-1">
          <button
            onClick={webcamReady ? stopWebcam : startWebcam}
            disabled={startingWebcam}
            className={`flex-1 text-sm rounded-md px-3 py-2 border transition disabled:opacity-50 ${
              webcamReady ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"
            }`}
          >
            {webcamReady ? "Stop Webcam" : startingWebcam ? "Starting..." : "Start Webcam"}
          </button>
          <button
            onClick={togglePauseWebcam}
            disabled={!webcamReady && !webcamPaused}
            title="Freeze / resume webcam"
            className={`text-xs rounded-md px-2 border transition disabled:opacity-40 ${
              webcamPaused ? "bg-amber-500 text-black border-amber-500" : "bg-card hover:bg-accent border-border"
            }`}
          >
            {webcamPaused ? "▶" : "❚❚"}
          </button>
        </div>
        {webcamMeta && <p className="text-[10px] text-muted-foreground truncate" title={webcamMeta}>{webcamMeta}{webcamPaused && " · PAUSED"}</p>}
        {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">BRB / Waiting Screen</h2>
        <button
          onClick={toggleBrbMode}
          className={`w-full text-sm rounded-md px-3 py-2 border transition ${
            brbActive ? "bg-indigo-500 text-white border-indigo-500 animate-pulse" : "bg-card hover:bg-accent border-border"
          }`}
        >
          {brbActive ? "Hide waiting overlay" : "Show \"We'll be back\" overlay"}
        </button>
        <p className="text-[10px] text-muted-foreground">BRB now freezes active sources while the waiting screen is up, then restores the previous pause state when you come back.</p>
        <input value={brbText} onChange={(e) => setBrbText(e.target.value)} placeholder="Headline" className="w-full bg-input rounded px-2 py-1 border border-border text-xs" />
        <input value={brbSubtext} onChange={(e) => setBrbSubtext(e.target.value)} placeholder="Subtext" className="w-full bg-input rounded px-2 py-1 border border-border text-xs" />
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depth · Person Cutout</h2>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${segmentReady ? "bg-emerald-500/20 text-emerald-400" : segmentLoading ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400"}`}>
            {segmentLoading ? "loading model…" : segmentReady ? "live" : "off"}
          </span>
        </div>
        <button
          onClick={() => setSegmentEnabled((v) => !v)}
          className={`w-full text-sm rounded-md px-3 py-2 border transition ${
            segmentEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"
          }`}
        >
          {segmentEnabled ? "Disable person cutout" : "Enable person cutout (behind screen)"}
        </button>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Uses on-device MediaPipe Selfie Segmentation to remove your background so the screen renders <em>behind</em> you.
        </p>
        {segmentError && <p className="text-[10px] text-destructive bg-destructive/10 rounded p-1.5">{segmentError}</p>}
        {segmentEnabled && (
          <>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              {(["screen-clipped", "full-cutout"] as const).map((m) => (
                <button key={m} onClick={() => setSegmentMode(m)} className={`rounded px-2 py-1 border ${segmentMode === m ? "bg-accent border-primary" : "bg-card border-border"}`}>
                  {m === "screen-clipped" ? "Screen-clipped" : "Full cutout"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={segmentInvert} onChange={(e) => setSegmentInvert(e.target.checked)} />
              Invert mask
            </label>
            <Slider label="Edge feather" value={featherPx} min={0} max={8} step={1} suffix="px" onChange={setFeatherPx} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={faceParallax} onChange={(e) => setFaceParallax(e.target.checked)} />
              Head-tracked parallax
            </label>
            {faceParallax && <Slider label="Parallax strength" value={parallaxStrength} min={0} max={200} step={5} suffix="px" onChange={setParallaxStrength} />}
          </>
        )}
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layer Locks</h2>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <button onClick={() => setScreenLocked((v) => !v)} className={`rounded px-2 py-1 border ${screenLocked ? "bg-amber-500 text-black border-amber-500" : "bg-card border-border"}`}>
            {screenLocked ? "🔒 Screen" : "🔓 Screen"}
          </button>
          <button onClick={() => setWebcamLocked((v) => !v)} className={`rounded px-2 py-1 border ${webcamLocked ? "bg-amber-500 text-black border-amber-500" : "bg-card border-border"}`}>
            {webcamLocked ? "🔒 Webcam" : "🔓 Webcam"}
          </button>
        </div>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Streaming (Kick / Twitch / YouTube)</h2>
        <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="Stream URL (e.g. rtmps://…/app/)" className="w-full bg-input rounded px-2 py-1 border border-border text-xs font-mono" />
        <input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} type="password" placeholder="Stream Key" className="w-full bg-input rounded px-2 py-1 border border-border text-xs font-mono" />
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button onClick={() => setStreamUrl(KICK_RTMPS_URL)} className="rounded-lg border border-white/10 bg-card px-2.5 py-1.5 transition hover:bg-accent">
            Use Kick RTMPS URL
          </button>
          <button onClick={downloadBridgeScript} className="rounded-lg border border-white/10 bg-card px-2.5 py-1.5 transition hover:bg-accent">
            Download Bridge
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[11px]">
          <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">fps</span><select value={streamFps} onChange={(e) => setStreamFps(Number(e.target.value))} className="bg-input rounded px-1 py-1 border border-border"><option value={30}>30</option><option value={60}>60</option></select></label>
          <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">bitrate k</span><input type="number" value={streamBitrate} onChange={(e) => setStreamBitrate(Number(e.target.value))} className="bg-input rounded px-1 py-1 border border-border" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-muted-foreground">keyframe s</span><input type="number" value={streamKeyframe} onChange={(e) => setStreamKeyframe(Number(e.target.value))} className="bg-input rounded px-1 py-1 border border-border" /></label>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {[6000, 9000, 12000].map((preset) => (
            <button
              key={preset}
              onClick={() => setStreamBitrate(preset)}
              className={`rounded px-2 py-1 border ${streamBitrate === preset ? "bg-accent border-primary" : "bg-card border-border"}`}
            >
              {preset / 1000} Mbps
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px]"><span className="text-muted-foreground">Bridge port</span><input type="number" value={bridgePort} onChange={(e) => setBridgePort(Number(e.target.value))} className="w-20 bg-input rounded px-1 py-0.5 border border-border" /></label>
        <button onClick={streaming ? stopStream : startStream} disabled={!screenReady && !webcamReady} className={`w-full text-sm rounded-md px-3 py-2 border transition disabled:opacity-40 ${streaming ? "bg-destructive text-destructive-foreground border-destructive animate-pulse" : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"}`}>
          {streaming ? "■ Stop Stream" : "● Go Live via Local Bridge"}
        </button>
        {streamStatus && <p className="text-[10px] font-mono text-muted-foreground break-words">{streamStatus}</p>}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Kick test flow: download and run the local bridge, paste your Kick stream key, then start studio streaming from this panel.
        </p>
        <p className="text-[10px] text-muted-foreground">Live target: {CANVAS_W}×{CANVAS_H} · {streamFps}fps · {(streamBitrate / 1000).toFixed(1)} Mbps to bridge</p>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio Mix</h2>
          <span className="text-[10px] text-muted-foreground">Recorder + Live bus</span>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-card/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Microphone</p>
              <p className="text-[10px] text-muted-foreground">{micAudioAvailable ? "Webcam mic is in the mix." : "No mic track detected from the camera source."}</p>
            </div>
            <button
              onClick={() => setMicMuted((value) => !value)}
              disabled={!micAudioAvailable}
              className={`rounded-md border px-2 py-1 text-[11px] transition disabled:opacity-40 ${micMuted ? "border-amber-500 bg-amber-500 text-black" : "border-border bg-background hover:bg-accent"}`}
            >
              {micMuted ? "Muted" : "Live"}
            </button>
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(micLevel * 100)}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">Input meter: {Math.round(micLevel * 100)}%</p>
          </div>
          <Slider label="Mic level" value={micVolume} min={0} max={150} step={1} suffix="%" onChange={setMicVolume} />
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-card/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Shared screen audio</p>
              <p className="text-[10px] text-muted-foreground">{screenAudioAvailable ? "System or tab audio is feeding the mix." : "Share a tab/window with audio enabled to bring it in."}</p>
            </div>
            <button
              onClick={() => setScreenAudioMuted((value) => !value)}
              disabled={!screenAudioAvailable}
              className={`rounded-md border px-2 py-1 text-[11px] transition disabled:opacity-40 ${screenAudioMuted ? "border-amber-500 bg-amber-500 text-black" : "border-border bg-background hover:bg-accent"}`}
            >
              {screenAudioMuted ? "Muted" : "Live"}
            </button>
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full rounded-full bg-sky-500 transition-[width] duration-100" style={{ width: `${Math.round(screenAudioLevel * 100)}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">Input meter: {Math.round(screenAudioLevel * 100)}%</p>
          </div>
          <Slider label="Screen audio level" value={screenAudioVolume} min={0} max={150} step={1} suffix="%" onChange={setScreenAudioVolume} />
        </div>
        <div className="rounded-lg border border-border bg-card/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Browser smoke test</p>
              <p className="text-[10px] text-muted-foreground">Checks whether your browser returns a real screen-audio track with measurable activity.</p>
            </div>
            <button
              onClick={runScreenAudioSmokeTest}
              disabled={screenAudioSmokeTesting}
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-40"
            >
              {screenAudioSmokeTesting ? "Testing…" : "Run test"}
            </button>
          </div>
          {screenAudioSmokeStatus && <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{screenAudioSmokeStatus}</p>}
        </div>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scene</h2>
        <div className="grid grid-cols-4 gap-1 text-xs">
          {(["black", "studio", "grid", "aurora"] as const).map((b) => (
            <button key={b} onClick={() => setBgTone(b)} className={`rounded px-2 py-1 border capitalize ${bgTone === b ? "bg-accent border-primary" : "bg-card border-border"}`}>{b}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <label className="flex-1 text-[11px] rounded px-2 py-1 border border-border bg-card hover:bg-accent text-center cursor-pointer">
            {customBgUrl ? "Replace custom BG" : "Upload custom BG image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCustomBgUrl(String(r.result)); r.readAsDataURL(f); }} />
          </label>
          {customBgUrl && <button onClick={() => setCustomBgUrl(null)} className="text-[11px] rounded px-2 py-1 border border-border bg-card hover:bg-destructive hover:text-destructive-foreground">✕</button>}
        </div>
        <button onClick={swapOrder} className="w-full text-xs rounded px-2 py-1 border border-border bg-card hover:bg-accent">Swap layer order (front: {order[1]})</button>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cinematic} onChange={(e) => setCinematic(e.target.checked)} />Cinematic</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={autoParallax} onChange={(e) => setAutoParallax(e.target.checked)} />Auto parallax drift</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />Show guides</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={snapGrid} onChange={(e) => setSnapGrid(e.target.checked)} />Snap to {GRID_SIZE}px grid</label>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performance</h2>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={autoQuality} onChange={(e) => setAutoQuality(e.target.checked)} />Auto quality scaling</label>
        <div className="grid grid-cols-3 gap-1 text-xs">
          {(["high", "medium", "low"] as const).map((q) => (
            <button key={q} onClick={() => { setAutoQuality(false); setQuality(q); }} className={`rounded px-2 py-1 border capitalize ${quality === q ? "bg-accent border-primary" : "bg-card border-border"}`}>{q}</button>
          ))}
        </div>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Layer</h2>
          <button onClick={resetLayer} className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent">Reset</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["screen", "webcam"] as LayerKey[]).map((k) => (
            <button key={k} onClick={() => setSelected(k)} className={`text-sm rounded-md px-3 py-2 border capitalize ${selected === k ? "bg-accent border-primary" : "bg-card hover:bg-accent border-border"}`}>
              {k}
              {outOfSafe[k] && <span className="ml-1 text-amber-400">⚠</span>}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1"><span className="text-muted-foreground uppercase">{k}</span><input type="number" value={Math.round(layer[k])} onChange={(e) => setField(k, Number(e.target.value))} className="bg-input rounded px-2 py-1 border border-border" /></label>
          ))}
        </div>
        <Slider label="Rotation" value={layer.rotation} min={-180} max={180} step={0.5} suffix="°" onChange={(v) => setField("rotation", v)} />
        <Slider label="Tilt X" value={layer.tiltX} min={-45} max={45} step={0.5} suffix="°" onChange={(v) => setField("tiltX", v)} />
        <Slider label="Tilt Y" value={layer.tiltY} min={-45} max={45} step={0.5} suffix="°" onChange={(v) => setField("tiltY", v)} />
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={(v) => setField("opacity", v)} />
        <Slider label="Scale" value={layer.scale} min={0.2} max={3} step={0.01} onChange={(v) => setField("scale", v)} />
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Style</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />Drop shadow</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rounded} onChange={(e) => setRounded(e.target.checked)} />Rounded webcam</label>
        {rounded && <Slider label="Corner radius" value={roundedRadius} min={0} max={200} step={1} suffix="px" onChange={setRoundedRadius} />}
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scene Presets</h2>
        <div className="flex gap-1">
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Name this scene" className="flex-1 bg-input rounded px-2 py-1 border border-border text-xs" />
          <button onClick={savePreset} className="text-xs rounded px-2 py-1 border border-border bg-card hover:bg-accent">Save</button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {presets.length === 0 && <p className="text-[11px] text-muted-foreground italic">No saved scenes yet</p>}
          {presets.map((p) => (
            <div key={p.id} className="flex items-center gap-1 group">
              <button onClick={() => loadPreset(p)} className="flex-1 text-left text-xs rounded px-2 py-1 border border-border bg-card hover:bg-accent truncate">{p.name}</button>
              <button onClick={() => deletePreset(p.id)} className="text-[10px] px-2 py-1 rounded border border-border opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground">✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className={`${sectionClassName} space-y-2`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output</h2>
        <div className="grid grid-cols-3 gap-1 text-xs">
          {(["balanced", "high", "max"] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => setRecordingQualityPreset(preset)}
              className={`rounded px-2 py-1 border capitalize ${recordingQualityPreset === preset ? "bg-accent border-primary" : "bg-card border-border"}`}
            >
              {preset}
            </button>
          ))}
        </div>
        <button onClick={recording ? stopRecording : startRecording} disabled={!screenReady && !webcamReady} className={`w-full text-sm rounded-md px-3 py-2 border transition disabled:opacity-50 ${recording ? "bg-destructive text-destructive-foreground border-destructive animate-pulse" : "bg-card hover:bg-accent border-border"}`}>
          {recording ? `■ Stop & Download (${recLabel})` : "● Start Recording"}
        </button>
        <p className="text-[10px] text-muted-foreground">
          {recordingProfile.mimeType?.includes("vp9") ? "WebM VP9" : "WebM"} · {recordingProfile.width}×{recordingProfile.height} · {recordingProfile.fps}fps target · {formatMegabits(recordingProfile.videoBitsPerSecond)} video
        </p>
      </section>

      <section className={`${sectionClassName} space-y-1 text-[11px] text-muted-foreground leading-relaxed`}>
        <p>· Drag box to move · corners to resize</p>
        <p>· Top ● handle to rotate (shift = snap 15°)</p>
        <p>· Shift + resize locks aspect</p>
        <p>· Arrows nudge · shift=20px · alt=1px</p>
        <p>· [ ] rotate · Tab switches layer</p>
      </section>
    </>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#06070b_0%,#090b12_100%)] text-foreground flex flex-col">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-primary to-destructive shadow-lg shadow-primary/20" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold leading-none">ScriptCam Studio</h1>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                One Surface
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Fast screen, camera, recording, streaming, overlays, and local capture in one studio.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.18em] ${studioModeTone}`}>
            {studioModeLabel}
          </span>
          <button
            onClick={() => setShowCreatorTools(true)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            Command Center
          </button>
          <button
            onClick={() => setShowGallery(true)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            Library {recordings.length > 0 ? `(${recordings.length})` : ""}
          </button>
          <button
            onClick={() => setShowPrepPanel((value) => !value)}
            className={`rounded-xl border px-3 py-2 text-foreground transition ${showPrepPanel ? "border-emerald-500/40 bg-emerald-500/15" : "border-border bg-card hover:bg-accent hover:text-accent-foreground"}`}
          >
            {showPrepPanel ? "Hide Prep" : "Show Prep"}
          </button>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
            <span className={`w-2 h-2 rounded-full ${fpsColor}`} />
            <span className="tabular-nums">{fps} fps</span>
            <span className="text-muted-foreground">· {frameMs}ms peak</span>
          </div>
          <span className="px-2 py-1 rounded bg-muted">
            Q: {quality}
          </span>
          <span className="px-2 py-1 rounded bg-muted">
            {CANVAS_W}×{CANVAS_H} · edit=out
          </span>
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-muted">
            <span className={`w-2 h-2 rounded-full ${screenReady ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <span>screen</span>
            <span className={`ml-2 w-2 h-2 rounded-full ${webcamReady ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <span>cam</span>
          </div>
          {brbActive && (
            <span className="px-2 py-1 rounded bg-indigo-500 text-white animate-pulse">BRB</span>
          )}
          {(screenPaused || webcamPaused) && (
            <span className="px-2 py-1 rounded bg-amber-500 text-black">
              ❚❚ {screenPaused && webcamPaused ? "both" : screenPaused ? "screen" : "cam"}
            </span>
          )}
          {recording && (
            <span className="px-2 py-1 rounded bg-destructive text-destructive-foreground animate-pulse tabular-nums">
              ● REC {recLabel}
            </span>
          )}
        </div>
      </header>

      {perfWarn && (
        <div className="px-6 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex justify-between">
          <span>⚠ {perfWarn}</span>
          <button onClick={() => setPerfWarn(null)} className="opacity-70 hover:opacity-100">dismiss</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 2xl:flex-row">
        <aside className={`${showPrepPanel ? "hidden 2xl:block" : "hidden"} w-[22rem] shrink-0 border-r border-white/10 bg-black/25 p-4 space-y-4 overflow-y-auto backdrop-blur-xl`}>
          <section className={`${quickCardClassName} space-y-3`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Primary Workflow</p>
                <h2 className="mt-1 text-base font-semibold text-foreground">ScriptCam Studio</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Operate the shot here, then reach for deeper controls only when you need extra authority.</p>
              </div>
              <button
                onClick={() => setShowCreatorTools(true)}
                className="rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary transition hover:bg-primary hover:text-primary-foreground"
              >
                Open Center
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-muted-foreground">Teleprompter</p>
                <p className="mt-1 font-medium text-foreground">{teleprompter.state.script.trim() ? (teleprompter.state.isVisible ? "Live in scene" : "Loaded") : "Empty"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-muted-foreground">Watermark</p>
                <p className="mt-1 font-medium text-foreground">{logo.hasLogo ? "Visible in output" : "Not added"}</p>
              </div>
            </div>
          </section>
          {studioControlSections}
        </aside>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_48%)]">
          <div className="flex min-h-full flex-col gap-4 pb-28">
            {showPrepPanel && (
            <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className={`${heroCardClassName} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.18),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.18),transparent_30%)]" />
                <div className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">Launch Pad</p>
                      <h2 className="mt-2 text-2xl font-semibold leading-tight text-foreground">Run the shot without hunting for controls.</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Share a source, bring in camera, record, and go live from one surface. Decorative copy is out of the way. Operational control stays close to the stage.</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/25 px-4 py-3 text-right shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Session State</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{studioModeLabel}</p>
                      <p className="text-xs text-muted-foreground">{sourceSummary}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <button
                      onClick={screenReady ? stopScreen : startScreen}
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${screenReady ? "border-primary bg-primary text-primary-foreground shadow-[0_18px_50px_rgba(220,38,38,0.35)]" : "border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em] opacity-80">Source 01</p>
                      <p className="mt-2 text-base font-semibold">{screenReady ? "Screen connected" : "Share your screen"}</p>
                      <p className="mt-1 text-xs opacity-75">{screenMeta || "Bring your app, browser, or desktop into the scene."}</p>
                    </button>
                    <button
                      onClick={webcamReady ? stopWebcam : startWebcam}
                      disabled={startingWebcam}
                      className={`rounded-[24px] border px-4 py-4 text-left transition disabled:opacity-50 ${webcamReady ? "border-primary bg-primary text-primary-foreground shadow-[0_18px_50px_rgba(220,38,38,0.35)]" : "border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em] opacity-80">Source 02</p>
                      <p className="mt-2 text-base font-semibold">{webcamReady ? "Camera connected" : startingWebcam ? "Starting camera..." : "Start your camera"}</p>
                      <p className="mt-1 text-xs opacity-75">{webcamMeta || "Bring yourself into frame with 1080p capture and clean audio."}</p>
                    </button>
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      disabled={!screenReady && !webcamReady}
                      className={`rounded-[24px] border px-4 py-4 text-left transition disabled:opacity-40 ${recording ? "border-destructive bg-destructive text-destructive-foreground shadow-[0_18px_50px_rgba(220,38,38,0.35)]" : "border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em] opacity-80">Capture</p>
                      <p className="mt-2 text-base font-semibold">{recording ? `Recording ${recLabel}` : "Start recording"}</p>
                      <p className="mt-1 text-xs opacity-75">{recording ? "The final file mirrors the live canvas output." : recordingSummary}</p>
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      onClick={streaming ? stopStream : startStream}
                      disabled={!screenReady && !webcamReady}
                      className={`rounded-full px-4 py-2 font-semibold transition disabled:opacity-40 ${streaming ? "bg-emerald-500 text-black" : "border border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                    >
                      {streaming ? "Stop Live" : "Go Live"}
                    </button>
                    <button onClick={() => setShowCreatorTools(true)} className="rounded-full border border-white/10 bg-black/25 px-4 py-2 font-semibold transition hover:bg-white/[0.06]">Open Command Center</button>
                    <button onClick={() => setShowGallery(true)} className="rounded-full border border-white/10 bg-black/25 px-4 py-2 font-semibold transition hover:bg-white/[0.06]">Open Library</button>
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-muted-foreground">Live path: {streamSummary}</span>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Essential Controls</p>
                        <p className="mt-1 text-xs text-muted-foreground">Primary actions now live in the Stage Dock so you can control the session without scrolling.</p>
                      </div>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] text-emerald-200">Dock is primary</span>
                    </div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className={`rounded-full border px-2.5 py-1 ${screenPaused ? "border-amber-500 bg-amber-500 text-black" : "border-white/10 text-muted-foreground"}`}>Screen {screenPaused ? "paused" : "live"}</span>
                        <span className={`rounded-full border px-2.5 py-1 ${webcamPaused ? "border-amber-500 bg-amber-500 text-black" : "border-white/10 text-muted-foreground"}`}>Cam {webcamPaused ? "paused" : "live"}</span>
                        <span className={`rounded-full border px-2.5 py-1 ${brbActive ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/10 text-muted-foreground"}`}>BRB {brbActive ? "on" : "off"}</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-muted-foreground">Script {teleprompter.state.script.trim() ? "ready" : "empty"}</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-muted-foreground">Logo {logo.hasLogo ? "armed" : "off"}</span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">This panel is now status-only. Use the fixed Stage Dock below for instant controls.</p>
                    </div>

                    <div className="mt-3 grid gap-2 xl:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Audio Mix</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">Mic and shared audio stay on stage.</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-muted-foreground">Live + Record</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          <div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground">Mic</span>
                              <button
                                onClick={() => setMicMuted((value) => !value)}
                                disabled={!micAudioAvailable}
                                className={`rounded-full border px-2.5 py-1 font-semibold transition disabled:opacity-40 ${micMuted ? "border-amber-500 bg-amber-500 text-black" : "border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                              >
                                {micMuted ? "Muted" : micAudioAvailable ? "Live" : "Unavailable"}
                              </button>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(micLevel * 100)}%` }} />
                            </div>
                            <div className="mt-2"><Slider label="Mic level" value={micVolume} min={0} max={150} step={1} suffix="%" onChange={setMicVolume} /></div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground">Screen audio</span>
                              <button
                                onClick={() => setScreenAudioMuted((value) => !value)}
                                disabled={!screenAudioAvailable}
                                className={`rounded-full border px-2.5 py-1 font-semibold transition disabled:opacity-40 ${screenAudioMuted ? "border-amber-500 bg-amber-500 text-black" : "border-white/10 bg-black/25 hover:bg-white/[0.06]"}`}
                              >
                                {screenAudioMuted ? "Muted" : screenAudioAvailable ? "Live" : "Unavailable"}
                              </button>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-sky-500 transition-[width] duration-100" style={{ width: `${Math.round(screenAudioLevel * 100)}%` }} />
                            </div>
                            <div className="mt-2"><Slider label="Screen level" value={screenAudioVolume} min={0} max={150} step={1} suffix="%" onChange={setScreenAudioVolume} /></div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-foreground">Screen-audio smoke test</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">Use this when a browser claims to share audio but the meter stays dead.</p>
                              </div>
                              <button
                                onClick={runScreenAudioSmokeTest}
                                disabled={screenAudioSmokeTesting}
                                className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold transition hover:bg-white/[0.06] disabled:opacity-40"
                              >
                                {screenAudioSmokeTesting ? "Testing…" : "Run test"}
                              </button>
                            </div>
                            {screenAudioSmokeStatus && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{screenAudioSmokeStatus}</p>}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Preset Library</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">Save and recall your stage layouts without opening the drawer.</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-muted-foreground">{presets.length} saved</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <input
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            placeholder="Save current scene"
                            className="flex-1 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
                          />
                          <button onClick={savePreset} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/[0.16]">Save</button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {presets.slice(0, 4).map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => loadPreset(preset)}
                              className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-white/[0.06]"
                            >
                              {preset.name}
                            </button>
                          ))}
                          {presets.length === 0 && <p className="text-xs text-muted-foreground">No scene presets yet. Save the current stage once and it becomes reusable.</p>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <button onClick={exportPresets} className="rounded-full border border-white/10 bg-black/25 px-3 py-2 font-semibold transition hover:bg-white/[0.06]">Export Library</button>
                          <label className="rounded-full border border-white/10 bg-black/25 px-3 py-2 font-semibold transition hover:bg-white/[0.06] cursor-pointer">
                            Import Library
                            <input type="file" accept="application/json" className="hidden" onChange={importPresets} />
                          </label>
                          <button onClick={() => setShowCreatorTools(true)} className="rounded-full border border-white/10 bg-black/25 px-3 py-2 font-semibold transition hover:bg-white/[0.06]">Open full library</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {needsQuickStart && (
                    <div className="mt-5 rounded-[28px] border border-primary/20 bg-primary/10 p-4 shadow-[0_18px_50px_rgba(220,38,38,0.12)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="max-w-2xl">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Quick Start</p>
                          <h3 className="mt-2 text-lg font-semibold text-foreground">Three moves. No scavenger hunt.</h3>
                          <p className="mt-1 text-sm text-muted-foreground">Arm the inputs, check the frame, then record. Everything else is optional.</p>
                        </div>
                        <button
                          onClick={() => setQuickStartDismissed(true)}
                          className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <button onClick={startScreen} className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-white/[0.06]">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Step 1</p>
                          <p className="mt-2 font-semibold text-foreground">Share screen</p>
                          <p className="mt-1 text-xs text-muted-foreground">Bring the app or tab onto the canvas.</p>
                        </button>
                        <button onClick={startWebcam} className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-white/[0.06]">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Step 2</p>
                          <p className="mt-2 font-semibold text-foreground">Start camera</p>
                          <p className="mt-1 text-xs text-muted-foreground">Layer yourself into frame with the default capture path.</p>
                        </button>
                        <button
                          onClick={startRecording}
                          disabled={!screenReady && !webcamReady}
                          className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-white/[0.06] disabled:opacity-40"
                        >
                          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Step 3</p>
                          <p className="mt-2 font-semibold text-foreground">Record take</p>
                          <p className="mt-1 text-xs text-muted-foreground">Capture the live canvas once framing looks right.</p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                <section className={heroCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Session Pulse</p>
                      <h3 className="mt-2 text-lg font-semibold text-foreground">Critical status only.</h3>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-muted-foreground">{currentConfig.label}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Performance</p>
                      <p className="mt-1 text-xl font-semibold text-foreground">{fps} fps</p>
                      <p className="text-xs text-muted-foreground">Peak frame {frameMs}ms · quality {quality}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Sources</p>
                      <p className="mt-1 text-xl font-semibold text-foreground">{sourceReadyCount}/2</p>
                      <p className="text-xs text-muted-foreground">{screenReady ? "Screen armed" : "Screen idle"} · {webcamReady ? "Cam armed" : "Cam idle"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Selected Layer</p>
                      <p className="mt-1 text-xl font-semibold capitalize text-foreground">{selected}</p>
                      <p className="text-xs text-muted-foreground">Front layer: {frontLayer} {outOfSafe[selected] ? "· outside safe area" : "· inside safe area"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Capture</p>
                      <p className="mt-1 text-base font-semibold text-foreground capitalize">{recordingQualityPreset}</p>
                      <p className="text-xs text-muted-foreground">{recordingSummary}</p>
                    </div>
                  </div>
                </section>

                <section className={heroCardClassName}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Stage Shortcuts</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Switch</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Tab</p>
                      <p className="text-xs text-muted-foreground">Cycle the active layer.</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Rotate</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">[ ]</p>
                      <p className="text-xs text-muted-foreground">Nudge the selected layer angle.</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Truth</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Live canvas is the export</p>
                      <p className="text-xs text-muted-foreground">No hidden alternate layout or surprise render path.</p>
                    </div>
                  </div>
                </section>
              </div>
            </section>
            )}

            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div
                className="relative w-full max-w-full overflow-hidden rounded-[28px]"
                style={{
                  aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
                  maxHeight: "calc(100dvh - 11rem)",
                  width: "min(100%, calc((100dvh - 11rem) * 16 / 9))",
                }}
              >
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded-[28px] border border-white/10 shadow-[0_35px_120px_rgba(0,0,0,0.45)] bg-black" />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] shadow-[0_18px_40px_rgba(0,0,0,0.28)] ${studioModeTone}`}>
                      {studioModeLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      {screenReady ? "Screen ready" : "Screen idle"} · {webcamReady ? "Cam ready" : "Cam idle"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      {currentConfig.label} guide
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      {recordingSummary}
                    </span>
                  </div>
                </div>
                {showGuides && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute border border-emerald-400/40"
                      style={{
                        left: `${(SAFE_MARGIN / CANVAS_W) * 100}%`,
                        top: `${(SAFE_MARGIN / CANVAS_H) * 100}%`,
                        right: `${(SAFE_MARGIN / CANVAS_W) * 100}%`,
                        bottom: `${(SAFE_MARGIN / CANVAS_H) * 100}%`,
                      }}
                    />
                    {currentConfig.ratio !== 16 / 9 && (
                      <div
                        className="absolute border-2 border-primary/60 rounded-[20px]"
                        style={getFramingGuideStyle(currentConfig.ratio)}
                      >
                        <span className="absolute -top-6 left-0 text-[10px] uppercase tracking-[0.18em] text-primary">
                          Frame guide · {currentConfig.label}
                        </span>
                      </div>
                    )}
                    <div className="absolute left-1/2 top-0 bottom-0 border-l border-white/10" />
                    <div className="absolute top-1/2 left-0 right-0 border-t border-white/10" />
                  </div>
                )}
                <div
                  ref={overlayRef}
                  className="absolute inset-0"
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {order.map((k) => (
                    <LayerHandles
                      key={k}
                      t={k === "screen" ? screenState : webcamState}
                      selected={selected === k}
                      label={k}
                      color={k === "screen" ? "rgba(59,130,246,1)" : "rgba(236,72,153,1)"}
                      locked={k === "screen" ? screenLocked : webcamLocked}
                      interactive={!(altHeld && k === order[order.length - 1])}
                      onSelect={() => setSelected(k)}
                      onPointerDown={(e, mode, corner) => onPointerDownLayer(e, k, mode, corner)}
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)] capitalize">
                      selected · {selected}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)] capitalize">
                      front · {frontLayer}
                    </span>
                    {teleprompter.state.script.trim() && (
                      <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                        Teleprompter {teleprompter.state.isVisible ? "live" : "loaded"}
                      </span>
                    )}
                    {logo.hasLogo && (
                      <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                        Watermark armed
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/90 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      {fps} fps · {frameMs}ms peak
                    </span>
                    {recording && (
                      <span className="rounded-full bg-destructive px-3 py-1 text-[11px] font-semibold text-destructive-foreground shadow-[0_18px_40px_rgba(220,38,38,0.28)]">
                        REC {recLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 w-[min(96vw,980px)] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-white/15 bg-[#060912]/90 px-3 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">Stage Dock</span>
            <button
              onClick={screenReady ? stopScreen : startScreen}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${screenReady ? "border-emerald-500 bg-emerald-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {screenReady ? "Screen On" : "Share Screen"}
            </button>
            <button
              onClick={webcamReady ? stopWebcam : startWebcam}
              disabled={startingWebcam}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${webcamReady ? "border-emerald-500 bg-emerald-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {webcamReady ? "Stop Cam" : startingWebcam ? "Starting..." : "Start Cam"}
            </button>
            <label className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] text-white/85">
              <span>Camera</span>
              <select
                value={selectedCameraDeviceId}
                onChange={handleCameraSourceChange}
                className="rounded bg-transparent text-[11px] text-white outline-none"
                title="Choose camera source (including iPhone Continuity Camera)"
              >
                <option value="" className="bg-[#0b1020] text-white">Auto</option>
                {videoDevices.map((device, index) => (
                  <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId} className="bg-[#0b1020] text-white">
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
              {selectedCameraDeviceId === "" && activeCameraLabel && (
                <span className="max-w-[180px] truncate text-[10px] text-emerald-300" title={`Auto using ${activeCameraLabel}`}>
                  {"auto -> "}{activeCameraLabel}
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] text-white/85">
              <span>Mic</span>
              <select
                value={selectedMicDeviceId}
                onChange={handleMicSourceChange}
                className="rounded bg-transparent text-[11px] text-white outline-none"
                title="Choose microphone source for camera capture"
              >
                <option value="" className="bg-[#0b1020] text-white">Auto</option>
                <option value="none" className="bg-[#0b1020] text-white">None</option>
                {audioInputDevices.map((device, index) => (
                  <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId} className="bg-[#0b1020] text-white">
                    {device.label || `Mic ${index + 1}`}
                  </option>
                ))}
              </select>
              {selectedMicDeviceId === "" && activeMicLabel && (
                <span className="max-w-[180px] truncate text-[10px] text-emerald-300" title={`Auto using ${activeMicLabel}`}>
                  {"auto -> "}{activeMicLabel}
                </span>
              )}
            </label>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={!screenReady && !webcamReady}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${recording ? "border-destructive bg-destructive text-destructive-foreground" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {recording ? "Stop Rec" : "Record"}
            </button>
            <button
              onClick={streaming ? stopStream : startStream}
              disabled={!screenReady && !webcamReady}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${streaming ? "border-emerald-500 bg-emerald-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {streaming ? "Stop Live" : "Go Live"}
            </button>
            <button
              onClick={togglePauseScreen}
              disabled={!screenReady && !screenPaused}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${screenPaused ? "border-amber-500 bg-amber-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {screenPaused ? "Resume Screen" : "Pause Screen"}
            </button>
            <button
              onClick={togglePauseWebcam}
              disabled={!webcamReady && !webcamPaused}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${webcamPaused ? "border-amber-500 bg-amber-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {webcamPaused ? "Resume Cam" : "Pause Cam"}
            </button>
            <button
              onClick={toggleBrbMode}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${brbActive ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              {brbActive ? "Exit BRB" : "BRB"}
            </button>
            <button
              onClick={toggleLeadLayout}
              className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]"
            >
              Swap Layout
            </button>
            <button
              onClick={toggleBehindHeadFx}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${segmentEnabled && segmentMode === "screen-clipped" ? "border-emerald-500 bg-emerald-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              Behind Head FX
            </button>
            <button
              onClick={() => setAutoParallax((value) => !value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${autoParallax ? "border-sky-500 bg-sky-500 text-black" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              Screen Parallax
            </button>
            <button onClick={() => setShowTeleprompterEditor(true)} className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]">Script</button>
            <button onClick={() => setShowOverlayEditor(true)} className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]">Overlays</button>
            <button onClick={() => setShowLogoUploader(true)} className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]">Logo</button>
            <button onClick={quickSavePreset} className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]">Save Preset</button>
            <button
              onClick={() => setShowDockPresets((value) => !value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${showDockPresets ? "border-primary bg-primary text-primary-foreground" : "border-white/15 bg-black/35 text-white hover:bg-white/[0.10]"}`}
            >
              Saved Presets ({Math.min(8, presets.length)}{presets.length > 8 ? `/${presets.length}` : ""})
            </button>
            <span className="ml-auto rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] text-white/80">{screenReady ? "screen ready" : "screen idle"} · {webcamReady ? "cam ready" : "cam idle"}</span>
          </div>
          {webcamMeta && <p className="mt-2 text-[11px] text-white/75">{webcamMeta}</p>}
          {error && <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">{error}</p>}
          {showDockPresets && (
            <div className="mt-2 flex flex-wrap gap-2 border-t border-white/10 pt-2">
              {presets.slice(0, 8).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]"
                >
                  {preset.name}
                </button>
              ))}
              {presets.length === 0 && <span className="text-[11px] text-white/70">No presets saved yet.</span>}
              {presets.length > 8 && (
                <span className="text-[11px] text-white/70">Showing newest 8 of {presets.length}.</span>
              )}
              <button onClick={() => setShowGallery(true)} className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.10]">Open Library</button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={showCreatorTools} onOpenChange={setShowCreatorTools}>
        <SheetContent side="right" className="w-full border-l border-white/10 bg-[#080b12]/95 p-0 text-foreground sm:max-w-2xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary"><PanelsTopLeft className="h-5 w-5" /></div>
                <div>
                  <SheetTitle>Command Center</SheetTitle>
                  <SheetDescription>Deep scene, capture, streaming, and creator controls without leaving the main studio surface.</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6 overscroll-contain">
              <section className="2xl:hidden space-y-5">
                {studioControlSections}
              </section>

              <section className="sticky top-0 z-10 -mx-1 rounded-[28px] border border-white/10 bg-[#0a0c12]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowTeleprompterEditor(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">Script</button>
                  <button onClick={() => setShowOverlayEditor(true)} className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Overlay</button>
                  <button onClick={() => setShowLogoUploader(true)} className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Logo</button>
                  <button onClick={() => setShowGallery(true)} className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Library</button>
                  <button onClick={() => setShowAspectRatio(true)} className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Framing</button>
                  <span className="ml-auto text-[11px] text-muted-foreground">Command Center keeps the deeper controls nearby without crowding the stage.</span>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Studio Toolkit</p>
                    <h3 className="mt-1 text-lg font-semibold">Keep the shot moving. Open details only when they help.</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Script, branding, overlays, recordings, and local capture stay in this one studio. The panels below are grouped so the stage stays the priority.</p>
                  </div>
                </div>
              </section>

              <Accordion type="multiple" defaultValue={["teleprompter", "utilities", "branding"]} className="space-y-4">
                <AccordionItem value="teleprompter" className="rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileText className="h-5 w-5" /></div>
                      <div>
                        <div>Script Teleprompter</div>
                        <div className="mt-1 text-sm font-normal text-muted-foreground">Edit the script, show it on stage, and reset it without leaving the studio.</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button onClick={() => setShowTeleprompterEditor(true)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">Edit Script</button>
                      <button onClick={() => teleprompter.toggleVisible()} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">{teleprompter.state.isVisible ? "Hide Prompt" : "Show Prompt"}</button>
                      <button onClick={handleTeleprompterReset} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Reset Scroll</button>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="utilities" className="rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary"><LayoutPanelTop className="h-5 w-5" /></div>
                      <div>
                        <div>In-Flow Studio Utilities</div>
                        <div className="mt-1 text-sm font-normal text-muted-foreground">Open the most-used supporting tools without changing surfaces.</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2 pt-1">
                      <button onClick={() => setShowOverlayEditor(true)} className="rounded-2xl border border-white/10 bg-card px-4 py-3 text-left transition hover:bg-accent">
                        <div className="font-medium">Social Overlay Editor</div>
                        <div className="mt-1 text-xs text-muted-foreground">Edit creator handles rendered into the studio output.</div>
                      </button>
                      <button onClick={() => setShowAspectRatio(true)} className="rounded-2xl border border-white/10 bg-card px-4 py-3 text-left transition hover:bg-accent">
                        <div className="font-medium">Framing Guide</div>
                        <div className="mt-1 text-xs text-muted-foreground">Current guide: {currentConfig.label} · {currentConfig.description}</div>
                      </button>
                      <button onClick={() => setShowSoundEffects(true)} className="rounded-2xl border border-white/10 bg-card px-4 py-3 text-left transition hover:bg-accent">
                        <div className="font-medium">Sound Effects</div>
                        <div className="mt-1 text-xs text-muted-foreground">Play quick audience and emphasis sounds during recording.</div>
                      </button>
                      <button onClick={() => setShowGallery(true)} className="rounded-2xl border border-white/10 bg-card px-4 py-3 text-left transition hover:bg-accent">
                        <div className="font-medium">Recordings Library</div>
                        <div className="mt-1 text-xs text-muted-foreground">Review, download, share, or delete takes without leaving the studio.</div>
                      </button>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="branding" className="rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary"><ImageIcon className="h-5 w-5" /></div>
                      <div>
                        <div>Brand Watermark</div>
                        <div className="mt-1 text-sm font-normal text-muted-foreground">Pin your logo into the exported frame only when the take needs it.</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button onClick={() => setShowLogoUploader(true)} className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">Manage Logo</button>
                      {logo.hasLogo && (
                        <button onClick={logo.removeLogo} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Remove Logo</button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="capture" className="rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Crop className="h-5 w-5" /></div>
                      <div>
                        <div>Local Capture Kit</div>
                        <div className="mt-1 text-sm font-normal text-muted-foreground">Fixed-region recorder presets and local starter kits when you need a capture path outside the browser.</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
                      <p className="max-w-2xl text-sm text-muted-foreground">These starter kits stay local. Use them when you want a fixed pixel recording region that mirrors the stage layout you built here.</p>
                      <button
                        onClick={() => setCapturePreviewVisible((value) => !value)}
                        className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent"
                      >
                        {capturePreviewVisible ? <EyeOff className="mr-2 inline h-4 w-4" /> : <Eye className="mr-2 inline h-4 w-4" />}
                        {capturePreviewVisible ? "Hide Preview" : "Show Preview"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                      <CapturePreview config={captureConfig} visible={capturePreviewVisible} />
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">Current export behavior</p>
                          <p className="mt-1">This kit exports a local-only fixed pixel recorder. Use sync if you want the crop starter to match the screen layer you arranged on stage.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <CaptureNumberField label="Display W" value={captureConfig.displayW} onChange={(value) => setCaptureField("displayW", value)} min={1} />
                          <CaptureNumberField label="Display H" value={captureConfig.displayH} onChange={(value) => setCaptureField("displayH", value)} min={1} />
                          <CaptureNumberField label="Crop X" value={captureConfig.x} onChange={(value) => setCaptureField("x", value)} min={0} />
                          <CaptureNumberField label="Crop Y" value={captureConfig.y} onChange={(value) => setCaptureField("y", value)} min={0} />
                          <CaptureNumberField label="Crop W" value={captureConfig.w} onChange={(value) => setCaptureField("w", value)} min={1} />
                          <CaptureNumberField label="Crop H" value={captureConfig.h} onChange={(value) => setCaptureField("h", value)} min={1} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <CaptureNumberField label="Video Index" value={captureConfig.videoIndex} onChange={(value) => setCaptureField("videoIndex", value)} min={0} />
                          <CaptureNumberField label="Audio Index" value={captureConfig.audioIndex} onChange={(value) => setCaptureField("audioIndex", value)} min={0} />
                          <CaptureNumberField label="FPS" value={captureConfig.fps} onChange={(value) => setCaptureField("fps", value)} min={1} />
                          <CaptureTextField label="Pixel Format" value={captureConfig.pixelFormat} onChange={(value) => setCaptureField("pixelFormat", value)} />
                        </div>
                        <CaptureTextField label="Audio Device Hint" value={captureConfig.audioDeviceName} onChange={(value) => setCaptureField("audioDeviceName", value)} />
                        <CaptureTextField label="Output Directory" value={captureConfig.outputDir} onChange={(value) => setCaptureField("outputDir", value)} />
                        <CaptureTextField label="File Prefix" value={captureConfig.filePrefix} onChange={(value) => setCaptureField("filePrefix", value)} />
                        <div className="flex flex-wrap gap-3">
                          <button onClick={syncCaptureToScreenLayer} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Use Screen Layer Bounds</button>
                          <button onClick={() => downloadCaptureKit("mac")} className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"><Download className="mr-2 inline h-4 w-4" />Mac Kit</button>
                          <button onClick={() => downloadCaptureKit("win")} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent"><Download className="mr-2 inline h-4 w-4" />Windows Kit</button>
                          <button onClick={copyCaptureSetup} className="rounded-2xl border border-white/10 bg-card px-4 py-2 text-sm transition hover:bg-accent">Copy Setup</button>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="workflow" className="rounded-[28px] border border-white/10 bg-white/[0.03] px-5">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary"><LayoutPanelTop className="h-5 w-5" /></div>
                      <div>
                        <div>Workflow Model</div>
                        <div className="mt-1 text-sm font-normal text-muted-foreground">Why everything is kept inside this one studio surface.</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground">This command center keeps recording, overlays, capture setup, and playback in one place so the stage stays the focal point and the workflow stays fast.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Suspense fallback={null}>
        <TeleprompterEditor
          isOpen={showTeleprompterEditor}
          script={teleprompter.state.script}
          onClose={() => setShowTeleprompterEditor(false)}
          onSave={teleprompter.setScript}
          onShow={teleprompter.show}
        />

        <LogoUploader
          isOpen={showLogoUploader}
          config={logo.config}
          onClose={() => setShowLogoUploader(false)}
          onUpload={logo.uploadLogo}
          onRemove={logo.removeLogo}
          onUpdatePosition={logo.updatePosition}
          onUpdateSize={logo.updateSize}
          onUpdateOpacity={logo.updateOpacity}
        />

        <OverlayEditor
          isOpen={showOverlayEditor}
          settings={overlays.settings}
          onClose={() => setShowOverlayEditor(false)}
          onAddSocialLink={overlays.addSocialLink}
          onUpdateSocialLink={overlays.updateSocialLink}
          onRemoveSocialLink={overlays.removeSocialLink}
          onSetPosition={overlays.setPosition}
          onToggleBackground={overlays.toggleBackground}
        />

        <AspectRatioSelector
          isOpen={showAspectRatio}
          current={aspectRatio}
          onSelect={changeAspectRatio}
          onClose={() => setShowAspectRatio(false)}
        />

        <SoundEffectsBoard
          isOpen={showSoundEffects}
          onClose={() => setShowSoundEffects(false)}
        />

        <RecordingsGallery
          isOpen={showGallery}
          recordings={recordings}
          onClose={() => setShowGallery(false)}
          onPlay={(recording) => setPlayingRecording(recording)}
          onDelete={deleteRecording}
          onDownload={downloadRecording}
          onShare={async (recording) => {
            const ok = await shareRecording(recording);
            if (!ok) toast.success("Downloaded — upload it where you want");
          }}
        />

        <VideoPlayerModal
          recording={playingRecording}
          onClose={() => setPlayingRecording(null)}
        />
      </Suspense>
    </div>
  );
}

function getFramingGuideStyle(targetRatio: number): React.CSSProperties {
  const canvasRatio = CANVAS_W / CANVAS_H;
  if (targetRatio > canvasRatio) {
    const heightPercent = (canvasRatio / targetRatio) * 100;
    const top = (100 - heightPercent) / 2;
    return { left: "0%", right: "0%", top: `${top}%`, bottom: `${top}%` };
  }

  const widthPercent = (targetRatio / canvasRatio) * 100;
  const left = (100 - widthPercent) / 2;
  return { top: "0%", bottom: "0%", left: `${left}%`, right: `${left}%` };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function Slider({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}
          {suffix ?? ""}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function CaptureNumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground uppercase tracking-[0.12em]">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function CaptureTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground uppercase tracking-[0.12em]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function CapturePreview({ config, visible }: { config: LocalCaptureConfig; visible: boolean }) {
  if (!visible) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/[0.06]">
          <EyeOff className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Preview hidden</p>
        <p className="mt-1 text-xs text-muted-foreground">The exported kit still uses the same fixed pixel region.</p>
      </div>
    );
  }

  const aspect = config.displayW / config.displayH || 16 / 9;
  const left = Math.max(0, Math.min(100, (config.x / config.displayW) * 100));
  const top = Math.max(0, Math.min(100, (config.y / config.displayH) * 100));
  const width = Math.max(0, Math.min(100 - left, (config.w / config.displayW) * 100));
  const height = Math.max(0, Math.min(100 - top, (config.h / config.displayH) * 100));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Display {config.displayW}x{config.displayH}</span>
        <span>Crop {config.w}x{config.h} @ ({config.x},{config.y})</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: `${aspect}` }}>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(26,35,52,1),rgba(12,31,56,1)_45%,rgba(48,18,39,1))]" />
        <div className="absolute left-[8%] top-[12%] h-[22%] w-[30%] rounded-xl border border-white/12 bg-black/20 shadow-xl" />
        <div className="absolute right-[10%] top-[16%] h-[18%] w-[20%] rounded-xl border border-white/10 bg-primary/15" />
        <div className="absolute bottom-[8%] left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 backdrop-blur-md">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="h-5 w-5 rounded-md bg-white/25" />
          ))}
        </div>
        <div className="absolute inset-0 bg-black/45" />
        <div
          className="absolute rounded-xl border-2 border-primary"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5), 0 0 24px rgba(239,68,68,0.4)",
          }}
        >
          <span className="absolute -top-6 left-0 text-[10px] uppercase tracking-[0.18em] text-primary">Target</span>
        </div>
      </div>
    </div>
  );
}

function LayerHandles({
  t, selected, label, color, onSelect, onPointerDown, locked = false, interactive = true,
}: {
  t: Transform; selected: boolean; label: string; color: string;
  locked?: boolean; interactive?: boolean;
  onSelect: () => void;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize" | "rotate", corner?: "nw" | "ne" | "sw" | "se") => void;
}) {
  const w = t.w * t.scale;
  const h = t.h * t.scale;
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const inert = locked || !interactive;
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${((cx - w / 2) / CANVAS_W) * 100}%`,
    top: `${((cy - h / 2) / CANVAS_H) * 100}%`,
    width: `${(w / CANVAS_W) * 100}%`,
    height: `${(h / CANVAS_H) * 100}%`,
    border: `2px ${selected ? "solid" : "dashed"} ${color}`,
    cursor: locked ? "not-allowed" : "move",
    boxSizing: "border-box",
    touchAction: "none",
    transform: `rotate(${t.rotation}deg) skew(${t.tiltY}deg, ${t.tiltX}deg)`,
    transformOrigin: "center center",
    opacity: selected ? 1 : 0.55,
    pointerEvents: inert ? "none" : "auto",
    zIndex: selected ? 2 : 1,
  };
  const handle: React.CSSProperties = {
    position: "absolute", width: 14, height: 14, background: color,
    border: "2px solid white", borderRadius: 3, touchAction: "none",
  };
  return (
    <div style={style} onPointerDown={(e) => { onSelect(); onPointerDown(e, "move"); }}>
      <div style={{
        position: "absolute", top: -24, left: 0, background: color, color: "white",
        fontSize: 10, padding: "2px 6px", borderRadius: 3, fontWeight: 700, letterSpacing: 0.5,
      }}>
        {label.toUpperCase()} · {Math.round(t.rotation)}°
      </div>
      <div onPointerDown={(e) => onPointerDown(e, "rotate")}
        style={{
          position: "absolute", top: -34, left: "50%", transform: "translateX(-50%)",
          width: 16, height: 16, borderRadius: "50%", background: "white",
          border: `3px solid ${color}`, cursor: "grab", touchAction: "none",
        }} />
      <div style={{
        position: "absolute", top: -18, left: "50%", width: 2, height: 18,
        background: color, transform: "translateX(-50%)", pointerEvents: "none",
      }} />
      {(["nw", "ne", "sw", "se"] as const).map((c) => {
        const pos: React.CSSProperties = {
          ...(c.includes("n") ? { top: -7 } : { bottom: -7 }),
          ...(c.includes("w") ? { left: -7 } : { right: -7 }),
          cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
        };
        return (
          <div key={c} style={{ ...handle, ...pos }}
            onPointerDown={(e) => onPointerDown(e, "resize", c)} />
        );
      })}
    </div>
  );
}
