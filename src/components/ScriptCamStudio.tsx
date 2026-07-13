import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Download, FolderOpen, Mic, Pause, Play, RefreshCw, Square, Video } from 'lucide-react';
import { toast } from 'sonner';
import { RecordingsGallery } from '@/components/RecordingsGallery';
import { TeleprompterEditor } from '@/components/TeleprompterEditor';
import { TeleprompterOverlay } from '@/components/TeleprompterOverlay';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
import { useRecorder } from '@/hooks/useRecorder';
import { useRecordings } from '@/hooks/useRecordings';
import { useTeleprompter } from '@/hooks/useTeleprompter';
import type { Recording } from '@/hooks/useRecorder';

const CAMERA_DEVICE_KEY = 'scriptcam.camera-device.v2';
const MIC_DEVICE_KEY = 'scriptcam.mic-device.v2';

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatMediaError = (error: unknown) => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera or microphone permission is blocked.';
    if (error.name === 'NotFoundError') return 'No camera was found.';
    if (error.name === 'NotReadableError') return 'Camera or microphone is busy in another app.';
    if (error.name === 'OverconstrainedError') return 'Selected camera or microphone is unavailable.';
  }
  return error instanceof Error ? error.message : 'Camera start failed.';
};

const stopStreamTracks = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export default function ScriptCamStudio() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem(CAMERA_DEVICE_KEY) || '');
  const [selectedMicId, setSelectedMicId] = useState(() => localStorage.getItem(MIC_DEVICE_KEY) || '');
  const [activeCameraLabel, setActiveCameraLabel] = useState('');
  const [activeMicLabel, setActiveMicLabel] = useState('');
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);

  const teleprompter = useTeleprompter();
  const recorder = useRecorder();
  const { recordings, addRecording, deleteRecording, downloadRecording, shareRecording } = useRecordings();

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((device) => device.kind === 'videoinput'));
      setAudioDevices(devices.filter((device) => device.kind === 'audioinput'));
    } catch {
      // Device labels may be hidden before permission; retry after camera start.
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    localStorage.setItem(CAMERA_DEVICE_KEY, selectedCameraId);
  }, [selectedCameraId]);

  useEffect(() => {
    localStorage.setItem(MIC_DEVICE_KEY, selectedMicId);
  }, [selectedMicId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!stream) {
      video.srcObject = null;
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const play = async () => {
      try {
        await video.play();
      } catch {
        // User gesture on Start Camera / Record will unlock playback on mobile browsers.
      }
    };

    if (video.readyState >= 2) {
      void play();
      return;
    }

    video.addEventListener('loadedmetadata', play, { once: true });
    return () => video.removeEventListener('loadedmetadata', play);
  }, [stream]);

  const stopCamera = useCallback(() => {
    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
    setIsCameraActive(false);
    setActiveCameraLabel('');
    setActiveMicLabel('');
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const buildAudioConstraints = useCallback((micId: string): MediaTrackConstraints | boolean => {
    if (micId === 'none') return false;
    return {
      ...(micId ? { deviceId: { ideal: micId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 2 },
    };
  }, []);

  const startCamera = useCallback(async (cameraId = selectedCameraId, micId = selectedMicId) => {
    if (isStartingCamera) return streamRef.current;
    setIsStartingCamera(true);
    setError(null);

    const baseVideo: MediaTrackConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    };

    const preferredVideo: MediaTrackConstraints = cameraId
      ? { ...baseVideo, deviceId: { exact: cameraId } }
      : { ...baseVideo, facingMode: { ideal: 'user' } };

    const softVideo: MediaTrackConstraints = cameraId
      ? { ...baseVideo, deviceId: { ideal: cameraId } }
      : baseVideo;

    const preferredAudio = buildAudioConstraints(micId);
    const attempts: MediaStreamConstraints[] = [
      { video: preferredVideo, audio: preferredAudio },
      { video: softVideo, audio: preferredAudio },
      { video: softVideo, audio: micId === 'none' ? false : true },
      { video: true, audio: micId === 'none' ? false : true },
    ];

    let nextStream: MediaStream | null = null;
    let lastError: unknown = null;

    try {
      for (const constraints of attempts) {
        try {
          nextStream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }

      if (!nextStream) throw lastError ?? new Error('Camera start failed.');

      stopStreamTracks(streamRef.current);
      streamRef.current = nextStream;
      setStream(nextStream);
      setIsCameraActive(true);

      const cameraTrack = nextStream.getVideoTracks()[0];
      const micTrack = nextStream.getAudioTracks()[0];
      setActiveCameraLabel(cameraTrack?.label || 'Camera');
      setActiveMicLabel(micTrack?.label || (micId === 'none' ? 'Mic off' : ''));
      if (!cameraId && cameraTrack?.getSettings().deviceId) {
        setSelectedCameraId(cameraTrack.getSettings().deviceId || '');
      }

      await refreshDevices();
      return nextStream;
    } catch (captureError) {
      const message = formatMediaError(captureError);
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsStartingCamera(false);
    }
  }, [buildAudioConstraints, isStartingCamera, refreshDevices, selectedCameraId, selectedMicId]);

  const handleCameraSelect = useCallback(async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    setSelectedCameraId(nextId);
    if (!isCameraActive || recorder.isRecording) return;
    await startCamera(nextId, selectedMicId);
  }, [isCameraActive, recorder.isRecording, selectedMicId, startCamera]);

  const handleMicSelect = useCallback(async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    setSelectedMicId(nextId);
    if (!isCameraActive || recorder.isRecording) return;
    await startCamera(selectedCameraId, nextId);
  }, [isCameraActive, recorder.isRecording, selectedCameraId, startCamera]);

  const handleRecord = useCallback(async () => {
    if (recorder.isRecording) {
      const recording = await recorder.stopRecording();
      if (recording) {
        addRecording(recording);
        setPlayingRecording(recording);
        toast.success('Recording saved');
      }
      return;
    }

    const activeStream = streamRef.current ?? await startCamera();
    if (!activeStream) return;

    try {
      await recorder.startVideoRecording(activeStream);
      toast.success('Recording started');
    } catch (recordError) {
      const message = recordError instanceof Error ? recordError.message : 'Recording could not start.';
      setError(message);
      toast.error(message);
    }
  }, [addRecording, recorder, startCamera]);

  const handleShareRecording = useCallback(async (recording: Recording) => {
    const shared = await shareRecording(recording);
    if (!shared) toast.success('Downloaded');
  }, [shareRecording]);

  const cameraStatus = useMemo(() => {
    if (recorder.isRecording) return `REC ${formatDuration(recorder.duration)}`;
    if (isStartingCamera) return 'Starting';
    return isCameraActive ? 'Camera ready' : 'Standby';
  }, [isCameraActive, isStartingCamera, recorder.duration, recorder.isRecording]);

  const cameraMeta = activeMicLabel
    ? `${activeCameraLabel || 'Camera'} · ${activeMicLabel}`
    : activeCameraLabel || 'No camera active';

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <section className="absolute inset-0">
        <video
          ref={videoRef}
          className="h-full w-full bg-background object-contain"
          autoPlay
          playsInline
          muted
        />
        {!isCameraActive && (
          <div className="absolute inset-0 grid place-items-center bg-background">
            <button
              onClick={() => startCamera()}
              disabled={isStartingCamera}
              className="inline-flex items-center gap-3 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              <Camera className="h-5 w-5" />
              {isStartingCamera ? 'Starting camera' : 'Start camera'}
            </button>
          </div>
        )}

        <TeleprompterOverlay
          state={teleprompter.state}
          scrollRef={teleprompter.scrollRef}
          onToggleAutoScroll={teleprompter.toggleAutoScroll}
          onResetScroll={teleprompter.resetScroll}
          onSetScrollSpeed={teleprompter.setScrollSpeed}
          onSetFontSize={teleprompter.setFontSize}
        />
      </section>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 p-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
        <div className="pointer-events-auto mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/80 px-3 py-2 shadow-lg backdrop-blur-xl">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-none">ScriptCam</h1>
            <p className="mt-1 max-w-[70vw] truncate text-xs text-muted-foreground">{cameraMeta}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${recorder.isRecording ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {cameraStatus}
            </span>
            <button
              onClick={() => setIsGalleryOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold transition hover:bg-accent hover:text-accent-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              {recordings.length}
            </button>
          </div>
        </div>
      </header>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
        <div className="pointer-events-auto mx-auto max-w-6xl rounded-md border border-border bg-background/85 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <Video className="h-4 w-4 shrink-0" />
              <select
                value={selectedCameraId}
                onChange={handleCameraSelect}
                disabled={recorder.isRecording}
                className="max-w-[11rem] bg-transparent text-foreground outline-none disabled:opacity-60"
                aria-label="Camera source"
              >
                <option value="">Auto camera</option>
                {videoDevices.map((device, index) => (
                  <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <Mic className="h-4 w-4 shrink-0" />
              <select
                value={selectedMicId}
                onChange={handleMicSelect}
                disabled={recorder.isRecording}
                className="max-w-[11rem] bg-transparent text-foreground outline-none disabled:opacity-60"
                aria-label="Microphone source"
              >
                <option value="">Auto mic</option>
                <option value="none">No mic</option>
                {audioDevices.map((device, index) => (
                  <option key={device.deviceId || `${device.kind}-${index}`} value={device.deviceId}>
                    {device.label || `Mic ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={isCameraActive ? stopCamera : () => startCamera()}
              disabled={recorder.isRecording || isStartingCamera}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {isCameraActive ? 'Reset cam' : 'Camera'}
            </button>

            <button
              onClick={handleRecord}
              disabled={isStartingCamera}
              className={`inline-flex h-12 min-w-[8.75rem] items-center justify-center gap-2 rounded-md px-5 text-sm font-bold transition disabled:opacity-50 ${recorder.isRecording ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            >
              {recorder.isRecording ? <Square className="h-4 w-4 fill-current" /> : <Video className="h-4 w-4" />}
              {recorder.isRecording ? 'Stop' : 'Record'}
            </button>

            <button
              onClick={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
              disabled={!recorder.isRecording}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              {recorder.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {recorder.isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              onClick={() => setIsTeleprompterOpen(true)}
              className="inline-flex h-11 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-accent hover:text-accent-foreground"
            >
              Script
            </button>

            <button
              onClick={() => setIsGalleryOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-accent hover:text-accent-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              Library
            </button>

            {playingRecording && (
              <button
                onClick={() => downloadRecording(playingRecording)}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            )}
          </div>

          {error && <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <TeleprompterEditor
        isOpen={isTeleprompterOpen}
        script={teleprompter.state.script}
        onClose={() => setIsTeleprompterOpen(false)}
        onSave={teleprompter.setScript}
        onShow={teleprompter.show}
      />

      <RecordingsGallery
        isOpen={isGalleryOpen}
        recordings={recordings}
        onClose={() => setIsGalleryOpen(false)}
        onPlay={setPlayingRecording}
        onDelete={deleteRecording}
        onDownload={downloadRecording}
        onShare={handleShareRecording}
      />

      <VideoPlayerModal
        recording={playingRecording}
        onClose={() => setPlayingRecording(null)}
        onDownload={downloadRecording}
        onShare={shareRecording}
      />
    </main>
  );
}