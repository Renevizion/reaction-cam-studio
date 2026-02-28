import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Trash2 } from 'lucide-react';

interface TeleprompterEditorProps {
  isOpen: boolean;
  script: string;
  onClose: () => void;
  onSave: (script: string) => void;
  onShow: () => void;
}

export const TeleprompterEditor: React.FC<TeleprompterEditorProps> = ({
  isOpen,
  script,
  onClose,
  onSave,
  onShow,
}) => {
  const [draft, setDraft] = useState(script);

  // Sync draft when opening
  React.useEffect(() => {
    if (isOpen) setDraft(script);
  }, [isOpen, script]);

  const handleSave = () => {
    onSave(draft);
    onShow();
    onClose();
  };

  const handleClear = () => {
    setDraft('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl border border-border"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Script / Teleprompter</h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 min-h-0 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Paste your script or teaching content below. It'll appear as a transparent overlay on your camera while recording.
              </p>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Paste your script here...

Example:
Welcome to today's lesson. In this video, we'll cover the key principles of...

Point 1: Always start with the fundamentals...

Point 2: Build on what you know..."
                className="flex-1 min-h-[300px] w-full rounded-xl bg-secondary border border-border p-4 text-foreground text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {draft.trim() ? `${draft.split(/\s+/).filter(Boolean).length} words` : 'No script loaded'}
                </span>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                {draft.trim() ? 'Save & Show' : 'Save'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
