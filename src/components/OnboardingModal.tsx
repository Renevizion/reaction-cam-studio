import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Video, Share2, Sparkles, ChevronRight } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'scriptcam-onboarded-v1';

export const hasOnboarded = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
};
export const markOnboarded = () => {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: <Sparkles className="w-10 h-10 text-primary" />,
      title: 'Welcome to ScriptCam',
      body: 'The teleprompter camera built for creators who already have their script ready. Paste it, record, post. That\'s the whole app.',
      cta: 'Show me how',
    },
    {
      icon: <FileText className="w-10 h-10 text-primary" />,
      title: '1. Paste your script',
      body: 'Tap the script icon, paste your content, and it floats as a transparent overlay over your camera. Adjust speed, size, and opacity as you read.',
      cta: 'Next',
    },
    {
      icon: <Video className="w-10 h-10 text-primary" />,
      title: '2. Hit record',
      body: 'Studio-quality 1080p video at 8 Mbps with clean audio — same quality as your iPhone\'s native camera. Bluetooth mics work natively.',
      cta: 'Next',
    },
    {
      icon: <Share2 className="w-10 h-10 text-primary" />,
      title: '3. Post anywhere',
      body: 'Share straight to TikTok, Reels, or Shorts from the gallery. Your branded watermark goes with you. Stop wasting takes — start shipping content.',
      cta: 'Start recording',
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      markOnboarded();
      onClose();
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = () => {
    markOnboarded();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="bg-card rounded-3xl w-full max-w-md p-7 shadow-2xl border border-border"
          >
            <div className="flex justify-center mb-5">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                {current.icon}
              </div>
            </div>

            <h2 className="text-2xl font-bold text-foreground text-center mb-3">
              {current.title}
            </h2>
            <p className="text-muted-foreground text-center mb-6 leading-relaxed">
              {current.body}
            </p>

            {/* Step dots */}
            <div className="flex justify-center gap-2 mb-6">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-8 bg-primary' : 'w-1.5 bg-muted'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              {current.cta}
              <ChevronRight className="w-4 h-4" />
            </button>

            {!isLast && (
              <button
                onClick={handleSkip}
                className="w-full py-2 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
