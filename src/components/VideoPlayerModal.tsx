import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  useEffect(() => {
    setVideoReady(false);
  }, [recording?.id]);

  return (
    <AnimatePresence>
      {recording && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 safe-area-top w-10 h-10 rounded-full glass flex items-center justify-center z-10"
          >
            <X className="w-5 h-5" />
          </button>
          
          {!videoReady && <div className="absolute inset-0 bg-black" />}
          <video
            key={recording.id}
            src={recording.url}
            className={`w-full h-full object-contain bg-black ${videoReady ? 'opacity-100' : 'opacity-0'}`}
            controls
            autoPlay
            playsInline
            preload="auto"
            onLoadedData={() => setVideoReady(true)}
            onError={() => {
              console.error('Playback failed for recording', recording.id, recording.blob.type);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
