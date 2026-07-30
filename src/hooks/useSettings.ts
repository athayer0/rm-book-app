import { useCallback, createContext, useContext } from 'react';
import { DEFAULT_THEME_COLOR } from '../constants/colors';
import { DEFAULT_CONTACT_METHOD } from '../constants/contactMethods';
import { EventSize, DEFAULT_EVENT_SIZE } from '../constants/eventSizes';
import { MapsApp, DEFAULT_MAPS_APP } from '../utils/mapUtils';
import { SETTINGS_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export interface AppSettings {
  weekStart: 'sunday' | 'monday';
  theme: 'light' | 'dark' | 'system';
  /** Drives `primary` — the header band and everything else tinted with it. */
  themeColor: string;
  eventTypeColors: Record<string, string>;
  eventTypeDefaultMinutes: Record<string, number>;
  gridStartHour: number;
  gridEndHour: number;
  eventSize: EventSize;
  /** Prepended to local numbers when building a WhatsApp link. */
  defaultCountryCode: string;
  /** What a new contact event's method starts as. Dates keep their own list. */
  defaultContactMethod: string;
  /** iOS only — Android opens addresses in Google Maps regardless. */
  mapsApp: MapsApp;
}

const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  theme: 'light',
  themeColor: DEFAULT_THEME_COLOR,
  eventTypeColors: {},
  eventTypeDefaultMinutes: {},
  gridStartHour: 6,
  gridEndHour: 24,
  eventSize: DEFAULT_EVENT_SIZE,
  defaultCountryCode: '+1',
  defaultContactMethod: DEFAULT_CONTACT_METHOD,
  mapsApp: DEFAULT_MAPS_APP,
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
  const { user } = useAuth();
  const { value, write, loaded } = useStoredState<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  // Stored settings predate any field added since they were written, so the
  // defaults fill the gaps rather than the stored object being used raw.
  const settings = { ...DEFAULT_SETTINGS, ...value };

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const next = await write(current => ({ ...DEFAULT_SETTINGS, ...current, ...partial }));

      // The only write path the settings table has ever had. Guarded on `loaded`
      // so a tap landing before the initial read can't push DEFAULT_SETTINGS
      // over a real server row. Coalesced, because every colour swatch and
      // duration pill in SettingsScreen calls straight through to here.
      if (user && loaded) {
        await enqueueUpsert('settings', user.id, { ...next, user_id: user.id });
      }
    },
    [user, loaded, write],
  );

  return { settings, updateSettings, loaded };
}

export function useSettings() {
  return useContext(SettingsContext);
}
