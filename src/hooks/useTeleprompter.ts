import { useState, useCallback, useRef, useEffect } from 'react';

export interface TeleprompterState {
  script: string;
  isVisible: boolean;
  isAutoScrolling: boolean;
  scrollSpeed: number; // 1-10
  fontSize: number; // px
  opacity: number; // 0-100
}

export const useTeleprompter = () => {
  const [state, setState] = useState<TeleprompterState>({
    script: '',
    isVisible: false,
    isAutoScrolling: false,
    scrollSpeed: 3,
    fontSize: 24,
    opacity: 70,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const setScript = useCallback((script: string) => {
    setState(prev => ({ ...prev, script }));
  }, []);

  const toggleVisible = useCallback(() => {
    setState(prev => ({ ...prev, isVisible: !prev.isVisible }));
  }, []);

  const show = useCallback(() => {
    setState(prev => ({ ...prev, isVisible: true }));
  }, []);

  const hide = useCallback(() => {
    setState(prev => ({ ...prev, isVisible: false, isAutoScrolling: false }));
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setState(prev => ({ ...prev, isAutoScrolling: !prev.isAutoScrolling }));
  }, []);

  const setScrollSpeed = useCallback((scrollSpeed: number) => {
    setState(prev => ({ ...prev, scrollSpeed }));
  }, []);

  const setFontSize = useCallback((fontSize: number) => {
    setState(prev => ({ ...prev, fontSize }));
  }, []);

  const setOpacity = useCallback((opacity: number) => {
    setState(prev => ({ ...prev, opacity }));
  }, []);

  const resetScroll = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (!state.isAutoScrolling || !scrollRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const el = scrollRef.current;
    const pixelsPerFrame = state.scrollSpeed * 0.3;

    const tick = () => {
      if (el.scrollTop < el.scrollHeight - el.clientHeight) {
        el.scrollTop += pixelsPerFrame;
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setState(prev => ({ ...prev, isAutoScrolling: false }));
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state.isAutoScrolling, state.scrollSpeed]);

  return {
    state,
    scrollRef,
    setScript,
    toggleVisible,
    show,
    hide,
    toggleAutoScroll,
    setScrollSpeed,
    setFontSize,
    setOpacity,
    resetScroll,
    hasScript: state.script.trim().length > 0,
  };
};
