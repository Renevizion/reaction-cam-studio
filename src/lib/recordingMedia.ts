import fixWebmDuration from "webm-duration-fix";

const DEFAULT_RECORDING_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const canPlaybackMimeType = (type: string) => {
  if (typeof document === "undefined") return true;
  const probe = document.createElement("video");
  if (probe.canPlayType(type)) return true;
  const baseType = type.split(";")[0] ?? type;
  return !!probe.canPlayType(baseType);
};

export const getSupportedPlayableMimeType = (candidates = DEFAULT_RECORDING_MIME_CANDIDATES) => {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type) && canPlaybackMimeType(type));
};

export const getRecordingExtension = (blob: Blob) => {
  const type = blob.type || "";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  return "webm";
};

export const isWebmBlob = (blob: Blob) => (blob.type || "").includes("webm");

export async function repairRecordingBlob(blob: Blob): Promise<Blob> {
  if (!isWebmBlob(blob) || blob.size === 0) return blob;

  try {
    const fixed = await fixWebmDuration(blob);
    if (!fixed || fixed.size === 0) return blob;
    return fixed.type === blob.type ? fixed : new Blob([fixed], { type: blob.type || fixed.type || "video/webm" });
  } catch (error) {
    console.warn("Could not repair WebM seek metadata", error);
    return blob;
  }
}