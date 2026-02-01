import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Trash2, Move } from 'lucide-react';

export interface LogoConfig {
  url: string | null;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
  opacity: number;
}

interface LogoUploaderProps {
  isOpen: boolean;
  config: LogoConfig;
  onClose: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onUpdatePosition: (position: LogoConfig['position']) => void;
  onUpdateSize: (size: number) => void;
  onUpdateOpacity: (opacity: number) => void;
}

const positions: { value: LogoConfig['position']; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

export const LogoUploader: React.FC<LogoUploaderProps> = ({
  isOpen,
  config,
  onClose,
  onUpload,
  onRemove,
  onUpdatePosition,
  onUpdateSize,
  onUpdateOpacity,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  };

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
              <h2 className="text-xl font-bold text-foreground">Logo / Watermark</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Upload Area */}
            {!config.url ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-muted rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-foreground font-medium">Upload Logo</p>
                <p className="text-sm text-muted-foreground">PNG or JPG, max 2MB</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preview */}
                <div className="relative bg-secondary rounded-2xl p-4 flex items-center justify-center">
                  <img
                    src={config.url}
                    alt="Logo preview"
                    className="max-h-24 object-contain"
                    style={{ opacity: config.opacity / 100 }}
                  />
                  <button
                    onClick={onRemove}
                    className="absolute top-2 right-2 p-2 rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Position */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Position
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {positions.map((pos) => (
                      <button
                        key={pos.value}
                        onClick={() => onUpdatePosition(pos.value)}
                        className={`p-2 rounded-xl text-sm transition-all ${
                          config.position === pos.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Size: {config.size}px
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="150"
                    value={config.size}
                    onChange={(e) => onUpdateSize(parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Opacity */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Opacity: {config.opacity}%
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={config.opacity}
                    onChange={(e) => onUpdateOpacity(parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
