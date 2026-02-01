import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  onSwitchCamera: () => void;
}

export const CameraOverlay: React.FC<CameraOverlayProps> = ({
  videoRef,
  isActive,
  onSwitchCamera,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ width: 120, height: 160 });

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!containerRef.current) return;
    
    const parent = containerRef.current.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const maxX = parentRect.width - size.width - 16;
    const maxY = parentRect.height - size.height - 16;

    setPosition({
      x: Math.max(16, Math.min(maxX, position.x + info.delta.x)),
      y: Math.max(16, Math.min(maxY, position.y + info.delta.y)),
    });
  };

  if (!isActive) {
    return null;
  }

  return (
    <motion.div
      ref={containerRef}
      className="absolute z-20 camera-overlay"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
      drag
      dragMomentum={false}
      onDrag={handleDrag}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-2 border-glass-border/50">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
        
        {/* Camera switch button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSwitchCamera();
          }}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
        >
          <RefreshCw className="w-4 h-4 text-foreground" />
        </button>

        {/* Drag indicator */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/40" />
      </div>
    </motion.div>
  );
};
