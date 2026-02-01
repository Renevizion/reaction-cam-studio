import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Search, X } from 'lucide-react';

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
    <motion.form
      onSubmit={handleSubmit}
      className="w-full"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={`relative flex items-center glass rounded-2xl transition-all ${
          isFocused ? 'ring-2 ring-primary/50' : ''
        } ${error ? 'ring-2 ring-destructive/50' : ''}`}
      >
        <div className="pl-4 text-muted-foreground">
          <Link className="w-5 h-5" />
        </div>
        
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Paste YouTube URL..."
          className="flex-1 bg-transparent px-3 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        
        {url && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 mr-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        
        <button
          type="submit"
          className="mr-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>
      
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-sm text-destructive px-4"
        >
          {error}
        </motion.p>
      )}
    </motion.form>
  );
};
