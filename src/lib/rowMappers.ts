// The app's in-memory/AsyncStorage shapes are camelCase; the Supabase schema
// (supabase-schema.sql) is snake_case. Everything crossing the network boundary
// goes through here. PostgREST rejects the whole request with PGRST204 if it
// sees a column it doesn't know, so unmapped keys are dropped rather than sent.

/** local field name -> db column name. Fields not listed pass through unchanged. */
const FIELD_MAPS: Record<string, Record<string, string>> = {
  people: {
    createdAt: 'created_at',
  },
  calendar_events: {
    startTime: 'start_time',
    endTime: 'end_time',
    recurringRule: 'recurring_rule',
    recurringUntil: 'recurring_until',
    excludedDates: 'excluded_dates',
    recurringDays: 'recurring_days',
    contactMethod: 'contact_method',
  },
  goal_definitions: {
    iconFamily: 'icon_family',
    builtIn: 'built_in',
  },
  goal_entries: {},
  event_statuses: {},
  settings: {
    weekStart: 'week_start',
    gridStartHour: 'grid_start_hour',
    gridEndHour: 'grid_end_hour',
    eventSize: 'event_size',
    eventTypeColors: 'event_type_colors',
    eventTypeDefaultMinutes: 'event_type_default_minutes',
    defaultCountryCode: 'default_country_code',
    mapsApp: 'maps_app',
  },
};

/** Every column that actually exists on each table. Anything else is dropped. */
const COLUMNS: Record<string, string[]> = {
  people: [
    'user_id', 'id', 'name', 'status', 'phone', 'whatsapp', 'messenger', 'address',
    'notes', 'starred', 'created_at', 'updated_at', 'deleted_at',
  ],
  calendar_events: [
    'user_id', 'id', 'title', 'type', 'color', 'date', 'start_time', 'end_time',
    'notes', 'recurring', 'recurring_rule', 'recurring_until', 'excluded_dates',
    'recurring_days', 'backup', 'people', 'contact_method', 'updated_at', 'deleted_at',
  ],
  goal_definitions: [
    'user_id', 'id', 'label', 'icon', 'icon_family', 'color',
    'visible', 'built_in', 'updated_at', 'deleted_at',
  ],
  goal_entries: [
    'user_id', 'goal_id', 'week_key', 'count', 'target', 'updated_at', 'deleted_at',
  ],
  event_statuses: [
    'user_id', 'event_id', 'occurrence_date', 'status', 'updated_at', 'deleted_at',
  ],
  settings: [
    'user_id', 'week_start', 'theme', 'grid_start_hour', 'grid_end_hour',
    'event_size', 'event_type_colors', 'event_type_default_minutes',
    'default_country_code', 'maps_app', 'updated_at',
  ],
};

/**
 * Primary key of each table. Drives both the upsert conflict target and the
 * delete predicate — with composite PKs, `id` alone no longer identifies a row.
 */
export const PK_COLUMNS: Record<string, string[]> = {
  people: ['user_id', 'id'],
  calendar_events: ['user_id', 'id'],
  goal_definitions: ['user_id', 'id'],
  goal_entries: ['user_id', 'goal_id', 'week_key'],
  event_statuses: ['user_id', 'event_id', 'occurrence_date'],
  settings: ['user_id'],
};

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

/**
 * Local shape -> db row. Unknown keys are dropped; `undefined` becomes `null` so
 * that clearing a field locally actually clears it server-side.
 *
 * Callers must send only the columns they own. goal_entries in particular relies
 * on this: PostgREST builds `SET col = EXCLUDED.col` only for keys present, so a
 * count-only write leaves an existing target alone.
 */
export function toRow(
  table: string,
  local: Record<string, unknown>,
): Record<string, unknown> {
  const fieldMap = FIELD_MAPS[table] ?? {};
  const columns = COLUMNS[table];
  const row: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(local)) {
    const column = fieldMap[key] ?? key;
    if (columns && !columns.includes(column)) continue;
    row[column] = value === undefined ? null : value;
  }
  return row;
}

/**
 * db row -> local shape. Drops sync bookkeeping the UI has no use for, and skips
 * nulls so a null server column can't clobber a value the client already holds.
 */
export function fromRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const reverse = invert(FIELD_MAPS[table] ?? {});
  const local: Record<string, unknown> = {};

  for (const [column, value] of Object.entries(row)) {
    if (column === 'user_id' || column === 'updated_at' || column === 'deleted_at') continue;
    const key = reverse[column] ?? column;
    if (value !== null) local[key] = value;
  }
  return local;
}
