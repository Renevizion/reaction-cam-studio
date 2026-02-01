import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2 } from 'lucide-react';

interface SoundEffect {
  id: string;
  label: string;
  emoji: string;
  frequency: number;
  duration: number;
  type: OscillatorType;
}

const soundEffects: SoundEffect[] = [
  { id: 'applause', label: 'Applause', emoji: '👏', frequency: 800, duration: 0.5, type: 'sawtooth' },
  { id: 'wow', label: 'Wow', emoji: '😮', frequency: 400, duration: 0.8, type: 'sine' },
  { id: 'laugh', label: 'Laugh', emoji: '😂', frequency: 600, duration: 0.3, type: 'square' },
  { id: 'ding', label: 'Ding', emoji: '🔔', frequency: 1200, duration: 0.4, type: 'sine' },
  { id: 'boom', label: 'Boom', emoji: '💥', frequency: 100, duration: 0.6, type: 'sawtooth' },
  { id: 'whoosh', label: 'Whoosh', emoji: '💨', frequency: 300, duration: 0.3, type: 'sine' },
  { id: 'pop', label: 'Pop', emoji: '🎈', frequency: 900, duration: 0.15, type: 'sine' },
  { id: 'error', label: 'Buzzer', emoji: '❌', frequency: 200, duration: 0.5, type: 'square' },
];

interface SoundEffectsBoardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SoundEffectsBoard: React.FC<SoundEffectsBoardProps> = ({
  isOpen,
  onClose,
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((effect: SoundEffect) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = effect.type;
    oscillator.frequency.setValueAtTime(effect.frequency, ctx.currentTime);
    
    // Add some variation for more realistic sounds
    if (effect.id === 'applause') {
      // Noise-like applause
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(effect.frequency + Math.random() * 400, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + effect.duration);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + effect.duration);
      }
    } else if (effect.id === 'wow') {
      oscillator.frequency.setValueAtTime(effect.frequency, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + effect.duration);
    } else if (effect.id === 'whoosh') {
      oscillator.frequency.setValueAtTime(effect.frequency, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + effect.duration);
    }
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + effect.duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + effect.duration);
  }, []);

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
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold text-foreground">Sound Effects</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Tap to play sounds during your recording
            </p>

            <div className="grid grid-cols-4 gap-3">
              {soundEffects.map((effect) => (
                <motion.button
                  key={effect.id}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => playSound(effect)}
                  className="aspect-square rounded-2xl bg-secondary hover:bg-secondary/80 flex flex-col items-center justify-center gap-1 transition-colors"
                >
                  <span className="text-2xl">{effect.emoji}</span>
                  <span className="text-xs text-muted-foreground">{effect.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
