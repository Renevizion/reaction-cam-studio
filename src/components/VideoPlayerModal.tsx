import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Recording } from '@/hooks/useRecorder';

interface VideoPlayerModalProps {
  recording: Recording | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  recording,
  onClose,
}) => {
  const [videoReady, setVideoReady] = useState(false);
  const [pausedFrame, setPausedFrame] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastFrameRef = useRef<string | null>(null);

  const captureVideoFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    setVideoReady(false);
    setPausedFrame(null);
    lastFrameRef.current = null;
  }, [recording?.id]);

  if (!recording) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 safe-area-top w-10 h-10 rounded-full glass flex items-center justify-center z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {!videoReady && (
        <div
          className="absolute inset-0 bg-black bg-center bg-cover"
          style={recording.thumbnail ? { backgroundImage: `url(${recording.thumbnail})` } : undefined}
        />
      )}
      {pausedFrame && (
        <div
          className="absolute inset-0 bg-black bg-center bg-contain bg-no-repeat"
          style={{ backgroundImage: `url(${pausedFrame})` }}
        />
      )}
      <video
        ref={videoRef}
        key={recording.id}
        src={recording.url}
        poster={recording.thumbnail}
        className={`w-full h-full object-contain bg-black ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        controls
        autoPlay
        playsInline
        preload="auto"
        onLoadedData={() => setVideoReady(true)}
        onPlay={() => setPausedFrame(null)}
        onPause={() => {
          if (lastFrameRef.current) setPausedFrame(lastFrameRef.current);
        }}
        onTimeUpdate={() => {
          const captured = captureVideoFrame();
          if (captured) lastFrameRef.current = captured;
        }}
        onError={() => {
          console.error('Playback failed for recording', recording.id, recording.blob.type);
        }}
      />
    </div>
  );
};
