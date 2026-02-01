import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownOverlayProps {
  count: number | null;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ count }) => {
  if (count === null) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={count}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.5 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="relative"
        >
          {/* Outer ring animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-4 border-primary"
            style={{ width: 200, height: 200, marginLeft: -100, marginTop: -100 }}
          />
          
          {/* Number */}
          <span className="text-[120px] font-bold text-primary drop-shadow-2xl">
            {count === 0 ? '🔴' : count}
          </span>
          
          {/* Label */}
          <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-foreground text-lg font-medium whitespace-nowrap">
            {count === 0 ? 'Recording!' : 'Get ready...'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
