import React from 'react';
import { motion } from 'framer-motion';
import { OverlaySettings, SocialLink } from '@/hooks/useOverlays';

interface SocialOverlayProps {
  settings: OverlaySettings;
}

const PlatformIcon = ({ platform }: { platform: SocialLink['platform'] }) => {
  switch (platform) {
    case 'cashapp':
      return (
        <div className="w-6 h-6 rounded-md bg-[#00D632] flex items-center justify-center">
          <span className="text-white font-bold text-sm">$</span>
        </div>
      );
    case 'tiktok':
      return (
        <div className="w-6 h-6 rounded-md bg-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
        </div>
      );
    case 'youtube':
      return (
        <div className="w-6 h-6 rounded-md bg-[#FF0000] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
            <path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.6 3.6 12 3.6 12 3.6s-7.6 0-9.5.5c-1 .3-1.7 1.1-2 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1 1.8 2 2.1 1.9.5 9.5.5 9.5.5s7.6 0 9.5-.5c1-.3 1.7-1.1 2-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/>
          </svg>
        </div>
      );
    case 'instagram':
      return (
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
            <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1m0-2.2c-3.3 0-3.7 0-5 .1-1.3.1-2.2.2-3 .5-.8.3-1.5.7-2.2 1.4C1.1 2.7.7 3.4.4 4.2c-.3.8-.5 1.7-.5 3-.1 1.3-.1 1.7-.1 5s0 3.7.1 5c.1 1.3.2 2.2.5 3 .3.8.7 1.5 1.4 2.2.7.7 1.4 1.1 2.2 1.4.8.3 1.7.5 3 .5 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.3-.1 2.2-.2 3-.5.8-.3 1.5-.7 2.2-1.4.7-.7 1.1-1.4 1.4-2.2.3-.8.5-1.7.5-3 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.3-.2-2.2-.5-3-.3-.8-.7-1.5-1.4-2.2-.7-.7-1.4-1.1-2.2-1.4-.8-.3-1.7-.5-3-.5-1.3-.1-1.7-.1-5-.1z"/>
            <path d="M12 5.8c-3.4 0-6.2 2.8-6.2 6.2s2.8 6.2 6.2 6.2 6.2-2.8 6.2-6.2-2.8-6.2-6.2-6.2zm0 10.2c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/>
            <circle cx="18.4" cy="5.6" r="1.4"/>
          </svg>
        </div>
      );
    case 'twitter':
      return (
        <div className="w-6 h-6 rounded-md bg-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">@</span>
        </div>
      );
  }
};

export const SocialOverlay: React.FC<SocialOverlayProps> = ({ settings }) => {
  const visibleLinks = settings.socialLinks.filter(link => link.visible && link.handle);
  
  if (visibleLinks.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: settings.position === 'top' ? -20 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute left-0 right-0 z-30 flex justify-center px-4 py-2 ${
        settings.position === 'top' ? 'top-0' : 'bottom-0'
      }`}
      style={{
        backgroundColor: settings.showBackground ? settings.backgroundColor : 'transparent',
      }}
    >
      <div className="flex items-center gap-4 flex-wrap justify-center">
        {visibleLinks.map((link) => (
          <div key={link.id} className="flex items-center gap-2">
            <PlatformIcon platform={link.platform} />
            <span
              className="font-semibold text-sm md:text-base"
              style={{ color: settings.textColor }}
            >
              {link.platform === 'cashapp' ? `$${link.handle.replace(/^\$/, '')}` : `@${link.handle.replace(/^@/, '')}`}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
