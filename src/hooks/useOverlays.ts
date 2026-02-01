import { useState, useCallback } from 'react';

export interface SocialLink {
  id: string;
  platform: 'tiktok' | 'youtube' | 'cashapp' | 'instagram' | 'twitter' | 'custom';
  handle: string;
  visible: boolean;
}

export interface OverlaySettings {
  position: 'top' | 'bottom';
  backgroundColor: string;
  textColor: string;
  showBackground: boolean;
  socialLinks: SocialLink[];
}

const defaultSettings: OverlaySettings = {
  position: 'top',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  textColor: '#ffffff',
  showBackground: true,
  socialLinks: [],
};

export function useOverlays() {
  const [settings, setSettings] = useState<OverlaySettings>(() => {
    const saved = localStorage.getItem('overlay-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const saveSettings = useCallback((newSettings: OverlaySettings) => {
    setSettings(newSettings);
    localStorage.setItem('overlay-settings', JSON.stringify(newSettings));
  }, []);

  const addSocialLink = useCallback((platform: SocialLink['platform'], handle: string) => {
    const newLink: SocialLink = {
      id: `social-${Date.now()}`,
      platform,
      handle,
      visible: true,
    };
    const newSettings = {
      ...settings,
      socialLinks: [...settings.socialLinks, newLink],
    };
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateSocialLink = useCallback((id: string, updates: Partial<SocialLink>) => {
    const newSettings = {
      ...settings,
      socialLinks: settings.socialLinks.map(link =>
        link.id === id ? { ...link, ...updates } : link
      ),
    };
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const removeSocialLink = useCallback((id: string) => {
    const newSettings = {
      ...settings,
      socialLinks: settings.socialLinks.filter(link => link.id !== id),
    };
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const setPosition = useCallback((position: 'top' | 'bottom') => {
    saveSettings({ ...settings, position });
  }, [settings, saveSettings]);

  const setBackgroundColor = useCallback((backgroundColor: string) => {
    saveSettings({ ...settings, backgroundColor });
  }, [settings, saveSettings]);

  const setTextColor = useCallback((textColor: string) => {
    saveSettings({ ...settings, textColor });
  }, [settings, saveSettings]);

  const toggleBackground = useCallback(() => {
    saveSettings({ ...settings, showBackground: !settings.showBackground });
  }, [settings, saveSettings]);

  const hasVisibleOverlays = settings.socialLinks.some(link => link.visible && link.handle);

  return {
    settings,
    addSocialLink,
    updateSocialLink,
    removeSocialLink,
    setPosition,
    setBackgroundColor,
    setTextColor,
    toggleBackground,
    hasVisibleOverlays,
  };
}
