import React, { useState, useRef } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  onSwitchCamera: () => void;
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const CameraOverlay: React.FC<CameraOverlayProps> = ({
  videoRef,
  isActive,
  onSwitchCamera,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ width: 150, height: 200 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const minSize = { width: 100, height: 130 };
  const maxSize = { width: 400, height: 530 };

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isResizing || isFullscreen) return;
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

  const handleResize = (corner: Corner, deltaX: number, deltaY: number) => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();

    setSize(prev => {
      let newWidth = prev.width;
      let newHeight = prev.height;

      // Adjust based on which corner is being dragged
      if (corner.includes('right')) {
        newWidth = Math.max(minSize.width, Math.min(maxSize.width, prev.width + deltaX));
      } else {
        newWidth = Math.max(minSize.width, Math.min(maxSize.width, prev.width - deltaX));
      }

      if (corner.includes('bottom')) {
        newHeight = Math.max(minSize.height, Math.min(maxSize.height, prev.height + deltaY));
      } else {
        newHeight = Math.max(minSize.height, Math.min(maxSize.height, prev.height - deltaY));
      }

      // Maintain aspect ratio (3:4)
      const aspectRatio = 3 / 4;
      newHeight = newWidth / aspectRatio;

      // Constrain to bounds
      if (newHeight > maxSize.height) {
        newHeight = maxSize.height;
        newWidth = newHeight * aspectRatio;
      }
      if (newHeight < minSize.height) {
        newHeight = minSize.height;
        newWidth = newHeight * aspectRatio;
      }

      return { width: newWidth, height: newHeight };
    });

    // Update position if resizing from top or left corners
    if (corner.includes('left')) {
      setPosition(prev => ({
        x: Math.max(16, prev.x + deltaX),
        y: prev.y,
      }));
    }
    if (corner.includes('top')) {
      setPosition(prev => ({
        x: prev.x,
        y: Math.max(16, prev.y + deltaY),
      }));
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  if (!isActive) {
    return null;
  }

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-4 z-30 rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/50"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
        
        {/* Controls */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSwitchCamera();
            }}
            className="w-10 h-10 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
          >
            <RefreshCw className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="w-10 h-10 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minimize2 className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Fullscreen indicator */}
        <div className="absolute top-4 left-4 px-3 py-1 rounded-full glass text-xs text-foreground font-medium">
          Full Camera View
        </div>
      </motion.div>
    );
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
      drag={!isResizing}
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
        
        {/* Resize handles */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
          <motion.div
            key={corner}
            className={`absolute w-6 h-6 ${
              corner === 'top-left' ? 'top-0 left-0 cursor-nw-resize' :
              corner === 'top-right' ? 'top-0 right-0 cursor-ne-resize' :
              corner === 'bottom-left' ? 'bottom-0 left-0 cursor-sw-resize' :
              'bottom-0 right-0 cursor-se-resize'
            }`}
            drag
            dragMomentum={false}
            dragElastic={0}
            onDragStart={() => setIsResizing(true)}
            onDrag={(_, info) => handleResize(corner as Corner, info.delta.x, info.delta.y)}
            onDragEnd={() => setIsResizing(false)}
          >
            <div className={`absolute w-3 h-3 bg-white/80 rounded-full ${
              corner === 'top-left' ? 'top-1 left-1' :
              corner === 'top-right' ? 'top-1 right-1' :
              corner === 'bottom-left' ? 'bottom-1 left-1' :
              'bottom-1 right-1'
            }`} />
          </motion.div>
        ))}
        
        {/* Camera switch button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSwitchCamera();
          }}
          className="absolute bottom-2 left-2 w-8 h-8 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
        >
          <RefreshCw className="w-4 h-4 text-foreground" />
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full glass flex items-center justify-center active:scale-95 transition-transform"
        >
          <Maximize2 className="w-4 h-4 text-foreground" />
        </button>

        {/* Drag indicator */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/40" />
      </div>
    </motion.div>
  );
};
