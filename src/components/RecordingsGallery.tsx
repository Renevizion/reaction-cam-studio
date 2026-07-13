import React, { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Trash2, Download, Clock, Share2 } from 'lucide-react';
import { Recording } from '@/hooks/useRecorder';

interface RecordingsGalleryProps {
  isOpen: boolean;
  recordings: Recording[];
  onClose: () => void;
  onPlay: (recording: Recording) => void;
  onDelete: (id: string) => void;
  onDownload: (recording: Recording) => void;
  onShare?: (recording: Recording) => void;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

interface RecordingCardProps {
  recording: Recording;
  index: number;
  onPlay: (recording: Recording) => void;
  onDelete: (id: string) => void;
  onDownload: (recording: Recording) => void;
  onShare?: (recording: Recording) => void;
}

const RecordingCard = memo(({
  recording,
  index,
  onPlay,
  onDelete,
  onDownload,
  onShare,
}: RecordingCardProps) => {
  const handlePlay = useCallback(() => onPlay(recording), [onPlay, recording]);
  const handleDownload = useCallback(() => onDownload(recording), [onDownload, recording]);
  const handleShare = useCallback(() => onShare?.(recording), [onShare, recording]);
  const handleDelete = useCallback(() => onDelete(recording.id), [onDelete, recording.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="relative aspect-video bg-black">
        {recording.thumbnail ? (
          <img
            src={recording.thumbnail}
            alt={`Recording from ${formatDate(recording.createdAt)}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-card" aria-hidden="true" />
        )}

        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors"
          aria-label="Play recording"
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center btn-glow">
            <Play className="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" />
          </div>
        </button>

        <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md glass text-xs font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(recording.duration)}
        </div>
      </div>

      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {formatDate(recording.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {onShare && (
            <button
              onClick={handleShare}
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              title="Share to TikTok, Reels, or Shorts"
              aria-label="Share recording"
            >
              <Share2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            title="Download"
            aria-label="Download recording"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full bg-destructive/20 text-destructive flex items-center justify-center hover:bg-destructive/30 transition-colors"
            title="Delete"
            aria-label="Delete recording"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}, (prev, next) => (
  prev.recording.id === next.recording.id
  && prev.recording.url === next.recording.url
  && prev.recording.thumbnail === next.recording.thumbnail
  && prev.recording.duration === next.recording.duration
  && prev.index === next.index
  && prev.onPlay === next.onPlay
  && prev.onDelete === next.onDelete
  && prev.onDownload === next.onDownload
  && prev.onShare === next.onShare
));

const RecordingsGalleryComponent: React.FC<RecordingsGalleryProps> = ({
  isOpen,
  recordings,
  onClose,
  onPlay,
  onDelete,
  onDownload,
  onShare,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background"
        >
          {/* Header */}
          <div className="safe-area-top px-4 py-4 flex items-center justify-between border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">
              My Recordings
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto no-scrollbar" style={{ height: 'calc(100vh - 100px)' }}>
            {recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-medium mb-1">No recordings yet</p>
                <p className="text-muted-foreground text-sm">
                  Paste your script, hit record, and your takes will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recordings.map((recording, index) => (
                  <RecordingCard
                    key={recording.id}
                    recording={recording}
                    index={index}
                    onPlay={onPlay}
                    onDelete={onDelete}
                    onDownload={onDownload}
                    onShare={onShare}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const RecordingsGallery = memo(RecordingsGalleryComponent, (prev, next) => (
  prev.isOpen === next.isOpen
  && prev.recordings === next.recordings
  && prev.onClose === next.onClose
  && prev.onPlay === next.onPlay
  && prev.onDelete === next.onDelete
  && prev.onDownload === next.onDownload
  && prev.onShare === next.onShare
));
