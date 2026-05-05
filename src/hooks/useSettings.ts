import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';

export interface AppSettings {
  weekStart: 'sunday' | 'monday';
  theme: 'light' | 'dark' | 'system';
  reminderEnabled: boolean;
  reminderTime: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  theme: 'light',
  reminderEnabled: false,
  reminderTime: '8:00 AM',
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getItem<AppSettings>('settings').then(stored => {
      if (stored) setSettingsState({ ...DEFAULT_SETTINGS, ...stored });
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettingsState(updated);
    await setItem('settings', updated);
  }, [settings]);

  return { settings, updateSettings, loaded };
}
