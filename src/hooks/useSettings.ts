import { useCallback, createContext, useContext } from 'react';
import {
  DEFAULT_THEME_COLOR,
  DEFAULT_SECONDARY_COLOR_LIGHT,
  DEFAULT_SECONDARY_COLOR_DARK,
  DEFAULT_TERTIARY_COLOR_LIGHT,
  DEFAULT_TERTIARY_COLOR_DARK,
} from '../constants/colors';
import { DEFAULT_CONTACT_METHOD } from '../constants/contactMethods';
import { EventSize, DEFAULT_EVENT_SIZE } from '../constants/eventSizes';
import { MapsApp, DEFAULT_MAPS_APP } from '../utils/mapUtils';
import { SETTINGS_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

/**
 * One of the calendar's quick-add bubbles: a type plus the icon that
 * distinguishes it there. A type has no icon of its own — the bubble is the
 * only place an icon is ever shown, so this is the only place one is set.
 */
export interface QuickAddType {
  id: string;
  icon: string;
  iconFamily?: string;
}

export interface AppSettings {
  weekStart: 'sunday' | 'monday';
  theme: 'light' | 'dark' | 'system';
  /** Drives `primary` — the header band and everything else tinted with it. */
  themeColor: string;
  /** Drives `accent` (Save/Done/EDIT, goal counts) — light and dark set independently. */
  secondaryColorLight: string;
  secondaryColorDark: string;
  /** Drives `control` (checkmarks, switches, active pills/tabs, the FAB, links). */
  tertiaryColorLight: string;
  tertiaryColorDark: string;
  eventTypeColors: Record<string, string>;
  eventTypeDefaultMinutes: Record<string, number>;
  /** Up to 8, in bubble order — see QuickAddTypesModal. */
  quickAddTypes: QuickAddType[];
  gridStartHour: number;
  gridEndHour: number;
  eventSize: EventSize;
  /** Prepended to local numbers when building a WhatsApp link. */
  defaultCountryCode: string;
  /** What a new contact event's method starts as. Dates keep their own list. */
  defaultContactMethod: string;
  /** iOS only — Android opens addresses in Google Maps regardless. */
  mapsApp: MapsApp;
  /** Whether the daily local notification reminding the user to report events is scheduled. */
  dailyReviewEnabled: boolean;
  /** 0-23, local device time. */
  dailyReviewHour: number;
  /** 0-59, local device time. */
  dailyReviewMinute: number;
  /** Whether a local notification fires ahead of every calendar event. */
  eventReminderEnabled: boolean;
  /** Minutes before an event's start the reminder fires. One of EVENT_REMINDER_MINUTE_OPTIONS. */
  eventReminderMinutes: number;
  /**
   * Event type ids excluded from reminders. Absence — not presence — is the
   * default, so a type added after this setting existed (built-in or custom)
   * still gets reminders until someone opts it out.
   */
  eventReminderExcludedTypeIds: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekStart: 'monday',
  theme: 'light',
  themeColor: DEFAULT_THEME_COLOR,
  secondaryColorLight: DEFAULT_SECONDARY_COLOR_LIGHT,
  secondaryColorDark: DEFAULT_SECONDARY_COLOR_DARK,
  tertiaryColorLight: DEFAULT_TERTIARY_COLOR_LIGHT,
  tertiaryColorDark: DEFAULT_TERTIARY_COLOR_DARK,
  eventTypeColors: {},
  eventTypeDefaultMinutes: {},
  // Matches the app's shipped quick-add bubbles and their icons (from
  // EventTypeIcons in colors.ts) exactly, so existing users see no change
  // until they open Settings > Quick Add and customize it themselves.
  quickAddTypes: [
    { id: 'travel', icon: 'car' },
    { id: 'activity', icon: 'people' },
    { id: 'date', icon: 'heart' },
    { id: 'temple', icon: 'church', iconFamily: 'MaterialCommunityIcons' },
    { id: 'contact', icon: 'chatbubble-ellipses' },
    { id: 'task', icon: 'checkbox' },
  ],
  gridStartHour: 6,
  gridEndHour: 24,
  eventSize: DEFAULT_EVENT_SIZE,
  defaultCountryCode: '+1',
  defaultContactMethod: DEFAULT_CONTACT_METHOD,
  mapsApp: DEFAULT_MAPS_APP,
  dailyReviewEnabled: false,
  dailyReviewHour: 22,
  dailyReviewMinute: 0,
  eventReminderEnabled: false,
  eventReminderMinutes: 5,
  eventReminderExcludedTypeIds: [],
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
