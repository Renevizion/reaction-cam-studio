import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { AspectRatioPreset, aspectRatioPresets } from '@/hooks/useAspectRatio';

interface AspectRatioSelectorProps {
  isOpen: boolean;
  current: AspectRatioPreset;
  onSelect: (preset: AspectRatioPreset) => void;
  onClose: () => void;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  isOpen,
  current,
  onSelect,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card w-full max-w-md rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Aspect Ratio</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(aspectRatioPresets) as AspectRatioPreset[]).map((preset) => {
                const config = aspectRatioPresets[preset];
                const isSelected = current === preset;
                
                return (
                  <button
                    key={preset}
                    onClick={() => {
                      onSelect(preset);
                      onClose();
                    }}
                    className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80 text-foreground'
                    }`}
                  >
                    <span className="text-2xl">{config.icon}</span>
                    <span className="font-bold">{config.label}</span>
                    <span className={`text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {config.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
