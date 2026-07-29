// Every AsyncStorage key the app owns, in one place. Screens and hooks must go
// through these rather than building key strings inline — an inline template
// literal is what let `indicators_${key}` survive a previous rename unnoticed.

export const PEOPLE_KEY = 'people';
export const CALENDAR_EVENTS_KEY = 'calendar_events';
export const GOAL_DEFINITIONS_KEY = 'goal_definitions';
export const EVENT_STATUSES_KEY = 'event_statuses';
export const SETTINGS_KEY = 'settings';

/** Device-local: which week the counts were last rolled over for. Never synced. */
export const LAST_RESET_KEY = 'last_reset_date';
export const LAST_SYNCED_KEY = 'last_synced_at';
export const SCHEMA_VERSION_KEY = 'schema_version';

/**
 * The user's own data — everything that is safe to export and must be cleared
 * when a different account signs in. Deliberately excludes the Supabase auth
 * token, the sync bookkeeping keys, and `schema_version` (clearing that would
 * re-run the migration and resurrect the legacy backup keys).
 */
const APP_DATA_KEYS = [
  PEOPLE_KEY,
  CALENDAR_EVENTS_KEY,
  GOAL_DEFINITIONS_KEY,
  EVENT_STATUSES_KEY,
  SETTINGS_KEY,
];

const APP_DATA_PREFIXES = ['goal_counts_', 'goal_targets_'];

export function isAppDataKey(key: string): boolean {
  if (APP_DATA_KEYS.includes(key)) return true;
  return APP_DATA_PREFIXES.some(prefix => key.startsWith(prefix));
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
