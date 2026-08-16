// Every AsyncStorage key the app owns, in one place. Screens and hooks must go
// through these rather than building key strings inline — a key assembled at the
// call site is invisible to a rename, and silently reads the wrong bucket.

export const PEOPLE_KEY = 'people';
export const CALENDAR_EVENTS_KEY = 'calendar_events';
export const GOAL_DEFINITIONS_KEY = 'goal_definitions';
export const EVENT_STATUSES_KEY = 'event_statuses';
export const SETTINGS_KEY = 'settings';

/** Device-local: which week the counts were last rolled over for. Never synced. */
export const LAST_RESET_KEY = 'last_reset_date';
export const LAST_SYNCED_KEY = 'last_synced_at';
/** Device-local: whether the welcome flow has played on this device for the current account. Never synced. */
export const HAS_ONBOARDED_KEY = 'has_onboarded';

/**
 * The user's own data: the rows they created, and nothing else. This is both
 * what gets cleared when a different account signs in and what the export hands
 * to the share sheet, so a key belongs here only if it is safe to send to a
 * third party. Deliberately excludes the Supabase auth token — a blanket dump
 * would carry `sb-<ref>-auth-token`, whose refresh token owns the account.
 *
 * A key that must be cleared but must NOT leave the device goes in
 * DEVICE_LOCAL_KEYS instead.
 */
const APP_DATA_KEYS = [
  PEOPLE_KEY,
  CALENDAR_EVENTS_KEY,
  GOAL_DEFINITIONS_KEY,
  EVENT_STATUSES_KEY,
  SETTINGS_KEY,
];

const APP_DATA_PREFIXES = ['goal_counts_', 'goal_targets_'];

/**
 * Cleared on account switch, never exported: bookkeeping that describes this
 * device's sync state rather than anything the user typed. Restoring one of
 * these from someone else's export would be actively wrong — a foreign
 * `last_synced_at` makes the first pull run incrementally against a watermark
 * from another session and come back empty.
 */
const DEVICE_LOCAL_KEYS = [LAST_SYNCED_KEY, LAST_RESET_KEY, HAS_ONBOARDED_KEY];

/** True for the user's own data — the export allowlist, and most of the wipe. */
export function isAppDataKey(key: string): boolean {
  if (APP_DATA_KEYS.includes(key)) return true;
  return APP_DATA_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Everything a sign-out must remove: app data plus this device's sync state. */
export function isClearableKey(key: string): boolean {
  return isAppDataKey(key) || DEVICE_LOCAL_KEYS.includes(key);
}

/** Per-week counts. `wk` is a bare week key like "2025-W21" from getWeekKey(). */
export function goalCountsKey(wk: string): string {
  return `goal_counts_${wk}`;
}

/** Per-week targets, same grain as the counts. */
export function goalTargetsKey(wk: string): string {
  return `goal_targets_${wk}`;
}

/** Composite key for a single occurrence of a (possibly recurring) event. */
export function statusKey(eventId: string, dateStr: string): string {
  return `${eventId}::${dateStr}`;
}
