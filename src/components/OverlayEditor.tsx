import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { OverlaySettings, SocialLink } from '@/hooks/useOverlays';

interface OverlayEditorProps {
  isOpen: boolean;
  settings: OverlaySettings;
  onClose: () => void;
  onAddSocialLink: (platform: SocialLink['platform'], handle: string) => void;
  onUpdateSocialLink: (id: string, updates: Partial<SocialLink>) => void;
  onRemoveSocialLink: (id: string) => void;
  onSetPosition: (position: 'top' | 'bottom') => void;
  onToggleBackground: () => void;
}

const platforms: { value: SocialLink['platform']; label: string; placeholder: string }[] = [
  { value: 'cashapp', label: 'Cash App', placeholder: 'username (no $)' },
  { value: 'tiktok', label: 'TikTok', placeholder: 'username' },
  { value: 'youtube', label: 'YouTube', placeholder: 'channel name' },
  { value: 'instagram', label: 'Instagram', placeholder: 'username' },
  { value: 'twitter', label: 'X / Twitter', placeholder: 'username' },
  { value: 'custom', label: 'Custom', placeholder: 'text' },
];

export const OverlayEditor: React.FC<OverlayEditorProps> = ({
  isOpen,
  settings,
  onClose,
  onAddSocialLink,
  onUpdateSocialLink,
  onRemoveSocialLink,
  onSetPosition,
  onToggleBackground,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<SocialLink['platform']>('tiktok');
  const [newHandle, setNewHandle] = useState('');

  const handleAddLink = () => {
    if (newHandle.trim()) {
      onAddSocialLink(selectedPlatform, newHandle.trim());
      setNewHandle('');
    }
  };

  const currentPlatform = platforms.find(p => p.value === selectedPlatform);

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
            transition={{ type: 'spring', damping: 25 }}
            className="bg-card w-full max-w-lg rounded-3xl p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Overlay Settings</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Position Toggle */}
            <div className="mb-6">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Overlay Position
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onSetPosition('top')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl transition-all ${
                    settings.position === 'top'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" />
                  Top
                </button>
                <button
                  onClick={() => onSetPosition('bottom')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl transition-all ${
                    settings.position === 'bottom'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowDown className="w-4 h-4" />
                  Bottom
                </button>
              </div>
            </div>

            {/* Background Toggle */}
            <div className="mb-6">
              <button
                onClick={onToggleBackground}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                  settings.showBackground
                    ? 'bg-primary/20 border border-primary/30'
                    : 'bg-secondary'
                }`}
              >
                <span className="text-sm font-medium text-foreground">Show Background</span>
                <div className={`w-10 h-6 rounded-full transition-colors ${
                  settings.showBackground ? 'bg-primary' : 'bg-muted'
                }`}>
                  <div className={`w-4 h-4 rounded-full bg-white mt-1 transition-transform ${
                    settings.showBackground ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </div>
              </button>
            </div>

            {/* Add New Social Link */}
            <div className="mb-6">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Add Social Link
              </label>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value as SocialLink['platform'])}
                  className="flex-shrink-0 px-3 py-2 rounded-xl bg-secondary text-foreground border-none outline-none"
                >
                  {platforms.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value)}
                  placeholder={currentPlatform?.placeholder || 'handle'}
                  className="flex-1 px-3 py-2 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground border-none outline-none min-w-0"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                />
                <button
                  onClick={handleAddLink}
                  disabled={!newHandle.trim()}
                  className="p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Current Links */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Your Links ({settings.socialLinks.length})
              </label>
              {settings.socialLinks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 bg-secondary/50 rounded-xl">
                  No social links added yet
                </p>
              ) : (
                <div className="space-y-2">
                  {settings.socialLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center gap-2 p-3 rounded-xl bg-secondary"
                    >
                      <span className="text-xs uppercase font-medium text-muted-foreground w-16">
                        {link.platform}
                      </span>
                      <input
                        type="text"
                        value={link.handle}
                        onChange={(e) => onUpdateSocialLink(link.id, { handle: e.target.value })}
                        className="flex-1 bg-transparent text-foreground outline-none min-w-0"
                      />
                      <button
                        onClick={() => onUpdateSocialLink(link.id, { visible: !link.visible })}
                        className={`p-2 rounded-lg transition-colors ${
                          link.visible
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {link.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => onRemoveSocialLink(link.id)}
                        className="p-2 rounded-lg text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
