import { useState, useCallback } from 'react';
import { LogoConfig } from '@/components/LogoUploader';

const defaultConfig: LogoConfig = {
  url: null,
  position: 'bottom-right',
  size: 80,
  opacity: 80,
};

export function useLogo() {
  const [config, setConfig] = useState<LogoConfig>(() => {
    const saved = localStorage.getItem('logo-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Don't restore the URL as it's a blob URL that won't persist
      return { ...defaultConfig, ...parsed, url: null };
    }
    return defaultConfig;
  });

  const saveConfig = useCallback((newConfig: LogoConfig) => {
    setConfig(newConfig);
    // Save everything except the URL (blob URLs don't persist)
    const { url, ...rest } = newConfig;
    localStorage.setItem('logo-config', JSON.stringify(rest));
  }, []);

  const uploadLogo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    saveConfig({ ...config, url });
  }, [config, saveConfig]);

  const removeLogo = useCallback(() => {
    if (config.url) {
      URL.revokeObjectURL(config.url);
    }
    saveConfig({ ...config, url: null });
  }, [config, saveConfig]);

  const updatePosition = useCallback((position: LogoConfig['position']) => {
    saveConfig({ ...config, position });
  }, [config, saveConfig]);

  const updateSize = useCallback((size: number) => {
    saveConfig({ ...config, size });
  }, [config, saveConfig]);

  const updateOpacity = useCallback((opacity: number) => {
    saveConfig({ ...config, opacity });
  }, [config, saveConfig]);

  return {
    config,
    uploadLogo,
    removeLogo,
    updatePosition,
    updateSize,
    updateOpacity,
    hasLogo: !!config.url,
  };
}
