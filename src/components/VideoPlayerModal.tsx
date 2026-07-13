import React, { useEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Share2 } from 'lucide-react';
import { Recording } from '@/hooks/useRecorder';

interface VideoPlayerModalProps {
  recording: Recording | null;
  onClose: () => void;
  onDownload?: (recording: Recording) => void;
  onShare?: (recording: Recording) => void;
}

/**
 * Loom/Streamyard-style playback:
 *  - Native <video controls playsInline> — never covered by overlays.
 *  - Portaled to <body> so re-renders of the studio tree above don't
 *    reconcile the <video> element (that was the root cause of the flicker).
 *  - No poster/thumbnail overlay — iOS Safari flashes the poster on every
 *    buffer/pause; dropping it removes the darker flicker.
 *  - preload="auto" for smooth scrubbing on the native timeline.
 *  - Memoized on recording.id so identical props from a busy parent don't
 *    force a video reload.
 */
const VideoPlayerModalImpl: React.FC<VideoPlayerModalProps> = ({
  recording,
  onClose,
  onDownload,
  onShare,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [recording?.id]);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, onClose]);

  // Pause + release the element on close so iOS doesn't keep the decoder hot.
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) {
        try { v.pause(); } catch {}
        v.removeAttribute('src');
        try { v.load(); } catch {}
      }
    };
  }, [recording?.id]);

  if (!recording) return null;

  const canShare = typeof navigator !== 'undefined'
    && 'canShare' in navigator
    && !!onShare;

  const modal = (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div
        className="flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-md"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <button
          onClick={onClose}
          aria-label="Close player"
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          {canShare && (
            <button
              onClick={() => onShare?.(recording)}
              aria-label="Share recording"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => onDownload(recording)}
              aria-label="Download recording"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          key={recording.id}
          src={recording.url}
          className="w-full h-full object-contain bg-black"
          controls
          autoPlay
          playsInline
          preload="auto"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onError={() => {
            setErrored(true);
            console.error('Playback failed for recording', recording.id, recording.blob?.type);
          }}
        />
      </div>

      {errored && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <div className="pointer-events-auto max-w-xs text-center bg-black/80 border border-white/10 rounded-2xl p-5 text-white">
            <p className="font-semibold mb-1">Can't play this file here</p>
            <p className="text-sm text-white/70 mb-4">
              Download it and open in your Photos or Files app — it will play natively.
            </p>
            {onDownload && (
              <button
                onClick={() => onDownload(recording)}
                className="w-full py-2 rounded-xl bg-white text-black font-medium"
              >
                Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
};

export const VideoPlayerModal = memo(VideoPlayerModalImpl, (prev, next) => {
  // Only re-render when the active recording actually changes.
  return (
    prev.recording?.id === next.recording?.id &&
    prev.recording?.url === next.recording?.url &&
    prev.onClose === next.onClose &&
    prev.onDownload === next.onDownload &&
    prev.onShare === next.onShare
  );
});
