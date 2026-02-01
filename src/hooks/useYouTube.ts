import { useState, useMemo } from 'react';

interface UseYouTubeReturn {
  videoId: string | null;
  embedUrl: string | null;
  setVideoUrl: (url: string) => void;
  isValidUrl: boolean;
  error: string | null;
}

export function useYouTube(): UseYouTubeReturn {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const videoId = useMemo(() => {
    if (!inputUrl) return null;
    
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = inputUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }, [inputUrl]);

  const embedUrl = useMemo(() => {
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1&playsinline=1`;
  }, [videoId]);

  const setVideoUrl = (url: string) => {
    setInputUrl(url);
    if (url && !url.includes('youtube.com') && !url.includes('youtu.be')) {
      setError('Please enter a valid YouTube URL');
    } else {
      setError(null);
    }
  };

  return {
    videoId,
    embedUrl,
    setVideoUrl,
    isValidUrl: !!videoId,
    error,
  };
}
