import React, { useState } from 'react';
import { Link, X } from 'lucide-react';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  error: string | null;
}

export const UrlInput: React.FC<UrlInputProps> = ({ onSubmit, error }) => {
  const [url, setUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  const handleClear = () => {
    setUrl('');
    onSubmit('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`relative flex items-center bg-secondary rounded-xl transition-all ${
          isFocused ? 'ring-2 ring-primary/50' : ''
        } ${error ? 'ring-2 ring-destructive/50' : ''}`}
      >
        <div className="pl-3 text-muted-foreground">
          <Link className="w-4 h-4" />
        </div>
        
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const pastedText = e.clipboardData.getData('text');
            if (!pastedText) return;
            e.preventDefault();
            setUrl(pastedText);
            if (pastedText.includes('youtube.com') || pastedText.includes('youtu.be')) {
              onSubmit(pastedText.trim());
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Paste YouTube URL..."
          className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
        />
        
        {url && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 mr-1 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </form>
  );
};
