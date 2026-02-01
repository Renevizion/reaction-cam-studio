import React from 'react';
import { motion } from 'framer-motion';
import { Circle, Square, Pause, Play, Video, VideoOff } from 'lucide-react';

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  isCameraActive: boolean;
  duration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onToggleCamera: () => void;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  isPaused,
  isCameraActive,
  duration,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onToggleCamera,
}) => {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute bottom-0 left-0 right-0 safe-area-bottom"
    >
      <div className="glass-strong mx-4 mb-4 rounded-3xl p-4">
        {/* Duration display when recording */}
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 mb-4"
          >
            <span className="w-2 h-2 rounded-full bg-recording recording-pulse" />
            <span className="font-mono text-lg font-semibold text-foreground">
              {formatDuration(duration)}
            </span>
            {isPaused && (
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Paused
              </span>
            )}
          </motion.div>
        )}

        <div className="flex items-center justify-center gap-6">
          {/* Camera toggle */}
          <button
            onClick={onToggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isCameraActive
                ? 'bg-secondary text-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isCameraActive ? (
              <Video className="w-6 h-6" />
            ) : (
              <VideoOff className="w-6 h-6" />
            )}
          </button>

          {/* Main record button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-recording btn-glow-recording'
                : 'bg-primary btn-glow'
            }`}
          >
            {isRecording ? (
              <Square className="w-8 h-8 text-primary-foreground fill-current" />
            ) : (
              <Circle className="w-10 h-10 text-primary-foreground fill-current" />
            )}
          </motion.button>

          {/* Pause/Resume button */}
          <button
            onClick={isPaused ? onResumeRecording : onPauseRecording}
            disabled={!isRecording}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-secondary text-foreground'
                : 'bg-muted text-muted-foreground opacity-50'
            }`}
          >
            {isPaused ? (
              <Play className="w-6 h-6" />
            ) : (
              <Pause className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
