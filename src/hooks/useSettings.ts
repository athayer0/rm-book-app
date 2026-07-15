import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { getItem, setItem } from '../utils/storage';

export interface AppSettings {
  weekStart: 'sunday' | 'monday';
  theme: 'light' | 'dark' | 'system';
  eventTypeColors: Record<string, string>;
  eventTypeDefaultMinutes: Record<string, number>;
  gridStartHour: number;
  gridEndHour: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  theme: 'light',
  eventTypeColors: {},
  eventTypeDefaultMinutes: {},
  gridStartHour: 6,
  gridEndHour: 24,
};

type SettingsContextValue = {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  loaded: boolean;
};

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  loaded: false,
});

export function useSettingsState(): SettingsContextValue {
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

export function useSettings() {
  return useContext(SettingsContext);
}
