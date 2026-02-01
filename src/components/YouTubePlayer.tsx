import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2 } from 'lucide-react';

interface YouTubePlayerProps {
  embedUrl: string | null;
  videoId?: string | null;
  className?: string;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ embedUrl, videoId, className }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [thumbSrc, setThumbSrc] = useState<string>('');
  const [thumbLoading, setThumbLoading] = useState(false);

  const thumbCandidates = useMemo(() => {
    if (!videoId) return null;
    // Prefer i.ytimg.com (fast + reliable). maxres may 404, so we fallback.
    return {
      max: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      hq: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }, [videoId]);

  // Reset local UI state whenever the user pastes a new video.
  useEffect(() => {
    setIsPlaying(false);
    setIsLoading(false);

    if (thumbCandidates) {
      setThumbSrc(thumbCandidates.max);
      setThumbLoading(true);
    } else {
      setThumbSrc('');
      setThumbLoading(false);
    }
  }, [thumbCandidates]);

  if (!embedUrl || !videoId) {
    return (
      <div className={`flex items-center justify-center bg-secondary rounded-lg ${className}`}>
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">
            Paste a YouTube URL to get started
          </p>
        </div>
      </div>
    );
  }

  // Show thumbnail with play button until user clicks
  if (!isPlaying) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative overflow-hidden rounded-lg bg-secondary cursor-pointer group ${className}`}
        onClick={() => {
          setIsLoading(true);
          setIsPlaying(true);
        }}
      >
        {/* Thumbnail (or a non-blank loading state) */}
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt="YouTube video thumbnail"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={() => setThumbLoading(false)}
            onError={() => {
              // Fallback if maxres isn't available
              if (thumbCandidates && thumbSrc === thumbCandidates.max) {
                setThumbSrc(thumbCandidates.hq);
              } else {
                setThumbLoading(false);
              }
            }}
          />
        ) : null}

        {thumbLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        
        {/* Dark overlay on hover */}
        <div className="absolute inset-0 bg-background/20 group-hover:bg-background/30 transition-colors" />
        
        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl"
          >
            <Play className="w-10 h-10 text-primary-foreground fill-current ml-1" />
          </motion.div>
        </div>

        {/* Click to play hint */}
        <div className="absolute bottom-4 left-4 right-4 text-center">
          <span className="px-3 py-1 rounded-full bg-background/70 text-foreground text-sm">
            Click to play video
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-lg bg-secondary ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary z-10">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}
      <iframe
        key={embedUrl}
        src={`${embedUrl}&autoplay=1`}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="YouTube video"
        onLoad={() => setIsLoading(false)}
      />
    </motion.div>
  );
};
