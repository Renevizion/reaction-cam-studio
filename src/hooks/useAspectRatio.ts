import { useState, useCallback } from 'react';

export type AspectRatioPreset = '16:9' | '9:16' | '1:1' | '4:3';

export interface AspectRatioConfig {
  label: string;
  ratio: number;
  description: string;
  icon: string;
}

export const aspectRatioPresets: Record<AspectRatioPreset, AspectRatioConfig> = {
  '16:9': {
    label: '16:9',
    ratio: 16 / 9,
    description: 'YouTube / Landscape',
    icon: '🖥️',
  },
  '9:16': {
    label: '9:16',
    ratio: 9 / 16,
    description: 'TikTok / Reels',
    icon: '📱',
  },
  '1:1': {
    label: '1:1',
    ratio: 1,
    description: 'Instagram Square',
    icon: '⬜',
  },
  '4:3': {
    label: '4:3',
    ratio: 4 / 3,
    description: 'Classic',
    icon: '📺',
  },
};

export function useAspectRatio() {
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>('16:9');

  const currentConfig = aspectRatioPresets[aspectRatio];

  const changeAspectRatio = useCallback((preset: AspectRatioPreset) => {
    setAspectRatio(preset);
  }, []);

  return {
    aspectRatio,
    currentConfig,
    changeAspectRatio,
    presets: aspectRatioPresets,
  };
}
