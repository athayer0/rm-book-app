import {
  DEFAULT_THEME_COLOR,
  DEFAULT_SECONDARY_COLOR_LIGHT, DEFAULT_SECONDARY_COLOR_DARK,
  DEFAULT_TERTIARY_COLOR_LIGHT, DEFAULT_TERTIARY_COLOR_DARK,
  DEFAULT_STATUS_COMPLETED_LIGHT, DEFAULT_STATUS_COMPLETED_DARK,
  DEFAULT_STATUS_FAILED_LIGHT, DEFAULT_STATUS_FAILED_DARK,
  DEFAULT_STATUS_PENDING_LIGHT, DEFAULT_STATUS_PENDING_DARK,
} from './colors';

export type ThemeColorRowKey =
  | 'primary' | 'secondaryLight' | 'secondaryDark' | 'tertiaryLight' | 'tertiaryDark'
  | 'statusCompletedLight' | 'statusCompletedDark' | 'statusFailedLight' | 'statusFailedDark'
  | 'statusPendingLight' | 'statusPendingDark';

export type ThemeColorSettingKey =
  | 'themeColor' | 'secondaryColorLight' | 'secondaryColorDark'
  | 'tertiaryColorLight' | 'tertiaryColorDark'
  | 'statusCompletedColorLight' | 'statusCompletedColorDark'
  | 'statusFailedColorLight' | 'statusFailedColorDark'
  | 'statusPendingColorLight' | 'statusPendingColorDark';

export interface ThemeColorRow {
  key: ThemeColorRowKey;
  label: string;
  settingKey: ThemeColorSettingKey;
  defaultValue: string;
  mode?: 'light' | 'dark';
}

/**
 * Every user-editable app-wide colour, and what it drives — shared by
 * SettingsScreen's "Customize Colors" list and the onboarding colours page,
 * so the two can't drift into offering a different set of knobs.
 *
 * Primary repaints headers/tabs/now-line. Secondary drives `accent` (Save,
 * Done, EDIT, goal counts). Tertiary drives `control` (checkmarks, switches,
 * active pills/tabs, the FAB, "add a thing" links). The three status colours
 * drive the calendar's completed/failed/pending badges. Light/dark variants
 * of everything but primary are independent settings — no auto dark-mode
 * lift — so each needs its own entry. `mode` is undefined for primary (it
 * applies to both themes at once) and 'light'/'dark' for the rest, so a
 * screen can filter to only the variant that's actually in effect right
 * now — editing the dark accent while looking at the light theme would be
 * editing a colour you can't see change.
 */
export const THEME_COLOR_ROWS: ThemeColorRow[] = [
  { key: 'primary', label: 'Primary', settingKey: 'themeColor', defaultValue: DEFAULT_THEME_COLOR },
  { key: 'secondaryLight', label: 'Secondary', settingKey: 'secondaryColorLight', defaultValue: DEFAULT_SECONDARY_COLOR_LIGHT, mode: 'light' },
  { key: 'secondaryDark', label: 'Secondary', settingKey: 'secondaryColorDark', defaultValue: DEFAULT_SECONDARY_COLOR_DARK, mode: 'dark' },
  { key: 'tertiaryLight', label: 'Tertiary', settingKey: 'tertiaryColorLight', defaultValue: DEFAULT_TERTIARY_COLOR_LIGHT, mode: 'light' },
  { key: 'tertiaryDark', label: 'Tertiary', settingKey: 'tertiaryColorDark', defaultValue: DEFAULT_TERTIARY_COLOR_DARK, mode: 'dark' },
  { key: 'statusCompletedLight', label: 'Completed Status', settingKey: 'statusCompletedColorLight', defaultValue: DEFAULT_STATUS_COMPLETED_LIGHT, mode: 'light' },
  { key: 'statusCompletedDark', label: 'Completed Status', settingKey: 'statusCompletedColorDark', defaultValue: DEFAULT_STATUS_COMPLETED_DARK, mode: 'dark' },
  { key: 'statusFailedLight', label: 'Failed Status', settingKey: 'statusFailedColorLight', defaultValue: DEFAULT_STATUS_FAILED_LIGHT, mode: 'light' },
  { key: 'statusFailedDark', label: 'Failed Status', settingKey: 'statusFailedColorDark', defaultValue: DEFAULT_STATUS_FAILED_DARK, mode: 'dark' },
  { key: 'statusPendingLight', label: 'Pending Status', settingKey: 'statusPendingColorLight', defaultValue: DEFAULT_STATUS_PENDING_LIGHT, mode: 'light' },
  { key: 'statusPendingDark', label: 'Pending Status', settingKey: 'statusPendingColorDark', defaultValue: DEFAULT_STATUS_PENDING_DARK, mode: 'dark' },
];
