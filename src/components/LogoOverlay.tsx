import React from 'react';
import { motion } from 'framer-motion';
import { LogoConfig } from './LogoUploader';

interface LogoOverlayProps {
  config: LogoConfig;
}

export const LogoOverlay: React.FC<LogoOverlayProps> = ({ config }) => {
  if (!config.url) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`absolute z-40 pointer-events-none ${positionClasses[config.position]}`}
    >
      <img
        src={config.url}
        alt="Logo"
        style={{
          width: config.size,
          height: 'auto',
          opacity: config.opacity / 100,
        }}
        className="object-contain drop-shadow-lg"
      />
    </motion.div>
  );
};
