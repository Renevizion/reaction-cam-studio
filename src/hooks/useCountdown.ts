import { useState, useCallback, useRef } from 'react';

interface UseCountdownReturn {
  count: number | null;
  isCountingDown: boolean;
  startCountdown: (onComplete: () => void) => void;
  cancelCountdown: () => void;
}

export function useCountdown(initialCount: number = 3): UseCountdownReturn {
  const [count, setCount] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef<(() => void) | null>(null);

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCount(null);
    setIsCountingDown(false);
    callbackRef.current = null;
  }, []);

  const startCountdown = useCallback((onComplete: () => void) => {
    cancelCountdown();
    callbackRef.current = onComplete;
    setIsCountingDown(true);
    setCount(initialCount);

    let current = initialCount;
    
    intervalRef.current = setInterval(() => {
      current -= 1;
      
      if (current < 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setCount(null);
        setIsCountingDown(false);
        callbackRef.current?.();
        callbackRef.current = null;
      } else {
        setCount(current);
      }
    }, 1000);
  }, [initialCount, cancelCountdown]);

  return {
    count,
    isCountingDown,
    startCountdown,
    cancelCountdown,
  };
}
