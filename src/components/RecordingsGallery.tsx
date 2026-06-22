import React from 'react';
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

export const RecordingsGallery: React.FC<RecordingsGalleryProps> = ({
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
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl"
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
                  <motion.div
                    key={recording.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="glass rounded-2xl overflow-hidden"
                  >
                    {/* Video preview */}
                    <div className="relative aspect-video bg-black">
                      <video
                        src={recording.url}
                        className="w-full h-full object-cover"
                        preload="metadata"
                      />
                      <button
                        onClick={() => onPlay(recording)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors"
                      >
                        <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center btn-glow">
                          <Play className="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" />
                        </div>
                      </button>
                      
                      {/* Duration badge */}
                      <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md glass text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(recording.duration)}
                      </div>
                    </div>

                    {/* Info and actions */}
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(recording.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {onShare && (
                          <button
                            onClick={() => onShare(recording)}
                            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                            title="Share to TikTok, Reels, or Shorts"
                          >
                            <Share2 className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => onDownload(recording)}
                          className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                          title="Download"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => onDelete(recording.id)}
                          className="w-10 h-10 rounded-full bg-destructive/20 text-destructive flex items-center justify-center hover:bg-destructive/30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
