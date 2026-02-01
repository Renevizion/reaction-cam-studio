import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface AudioLevelMeterProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({ stream, isRecording }) => {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !isRecording) {
      setLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalizedLevel = Math.min(100, (average / 128) * 100);
      
      setLevel(normalizedLevel);
      animationRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isRecording]);

  if (!isRecording) return null;

  const bars = 12;
  const activeBarCount = Math.floor((level / 100) * bars);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-1 px-3 py-2 rounded-xl glass"
    >
      <span className="text-xs text-muted-foreground mr-1">MIC</span>
      <div className="flex items-end gap-[2px] h-4">
        {Array.from({ length: bars }).map((_, i) => {
          const isActive = i < activeBarCount;
          const height = 4 + (i * 1); // Progressive height
          
          // Color gradient: green -> yellow -> red
          let colorClass = 'bg-green-500';
          if (i >= bars * 0.7) {
            colorClass = 'bg-red-500';
          } else if (i >= bars * 0.5) {
            colorClass = 'bg-yellow-500';
          }
          
          return (
            <motion.div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 ${
                isActive ? colorClass : 'bg-muted/30'
              }`}
              style={{ height: `${height}px` }}
              animate={{
                opacity: isActive ? 1 : 0.3,
              }}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground ml-1 w-8 text-right">
        {Math.round(level)}%
      </span>
    </motion.div>
  );
};
