import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Minus, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { TeleprompterState } from '@/hooks/useTeleprompter';

interface TeleprompterOverlayProps {
  state: TeleprompterState;
  scrollRef: React.RefObject<HTMLDivElement>;
  onToggleAutoScroll: () => void;
  onResetScroll: () => void;
  onSetScrollSpeed: (speed: number) => void;
  onSetFontSize: (size: number) => void;
}

export const TeleprompterOverlay: React.FC<TeleprompterOverlayProps> = ({
  state,
  scrollRef,
  onToggleAutoScroll,
  onResetScroll,
  onSetScrollSpeed,
  onSetFontSize,
}) => {
  if (!state.isVisible || !state.script) return null;

  const handleManualScroll = (direction: 'up' | 'down') => {
    if (!scrollRef.current) return;
    const amount = state.fontSize * 3;
    scrollRef.current.scrollBy({
      top: direction === 'down' ? amount : -amount,
      behavior: 'smooth',
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-25 pointer-events-none flex flex-col"
        style={{ backgroundColor: `rgba(0, 0, 0, ${state.opacity / 200})` }}
      >
        {/* Script text area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-8 py-6 pointer-events-auto scrollbar-hide"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          }}
        >
          <div
            className="text-white font-medium leading-relaxed whitespace-pre-wrap text-center mx-auto max-w-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            style={{
              fontSize: state.fontSize,
              opacity: state.opacity / 100,
              lineHeight: 1.6,
            }}
          >
            {state.script}
          </div>
        </div>

        {/* Teleprompter controls bar */}
        <div className="pointer-events-auto flex items-center justify-center gap-2 px-4 py-2">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
            {/* Manual scroll up */}
            <button
              onClick={() => handleManualScroll('up')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* Auto-scroll toggle */}
            <button
              onClick={onToggleAutoScroll}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                state.isAutoScrolling
                  ? 'bg-primary text-primary-foreground'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              {state.isAutoScrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            {/* Manual scroll down */}
            <button
              onClick={() => handleManualScroll('down')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/20 mx-1" />

            {/* Speed control */}
            <span className="text-white/50 text-xs">SPD</span>
            <button
              onClick={() => onSetScrollSpeed(Math.max(1, state.scrollSpeed - 1))}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-white text-xs font-mono w-4 text-center">{state.scrollSpeed}</span>
            <button
              onClick={() => onSetScrollSpeed(Math.min(10, state.scrollSpeed + 1))}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/20 mx-1" />

            {/* Font size */}
            <span className="text-white/50 text-xs">Aa</span>
            <button
              onClick={() => onSetFontSize(Math.max(14, state.fontSize - 2))}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-white text-xs font-mono w-5 text-center">{state.fontSize}</span>
            <button
              onClick={() => onSetFontSize(Math.min(48, state.fontSize + 2))}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/20 mx-1" />

            {/* Reset */}
            <button
              onClick={onResetScroll}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
