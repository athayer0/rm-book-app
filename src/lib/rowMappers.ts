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
    monthlyVisible: 'monthly_visible',
    order: 'sort_order',
    monthlyOrder: 'monthly_sort_order',
  },
  event_type_definitions: {
    builtIn: 'built_in',
    goalId: 'goal_id',
    goalMode: 'goal_mode',
    lateGoalId: 'late_goal_id',
    goalSplitTime: 'goal_split_time',
    reportStyle: 'report_style',
    order: 'sort_order',
  },
  goal_entries: {},
  goal_monthly_entries: {},
  event_statuses: {},
  convert_progress: {},
  settings: {
    weekStart: 'week_start',
    timeFormat: 'time_format',
    themeColor: 'theme_color',
    secondaryColorLight: 'secondary_color_light',
    secondaryColorDark: 'secondary_color_dark',
    tertiaryColorLight: 'tertiary_color_light',
    tertiaryColorDark: 'tertiary_color_dark',
    gridStartHour: 'grid_start_hour',
    gridEndHour: 'grid_end_hour',
    eventSize: 'event_size',
    eventTypeColors: 'event_type_colors',
    eventTypeDefaultMinutes: 'event_type_default_minutes',
    quickAddTypes: 'quick_add_types',
    defaultCountryCode: 'default_country_code',
    defaultContactMethod: 'default_contact_method',
    mapsApp: 'maps_app',
    dailyReviewEnabled: 'daily_review_enabled',
    dailyReviewHour: 'daily_review_hour',
    dailyReviewMinute: 'daily_review_minute',
    eventReminderEnabled: 'event_reminder_enabled',
    eventReminderMinutes: 'event_reminder_minutes',
    eventReminderExcludedTypeIds: 'event_reminder_excluded_type_ids',
  },
};

/** Every column that actually exists on each table. Anything else is dropped. */
const COLUMNS: Record<string, string[]> = {
  people: [
    'user_id', 'id', 'name', 'status', 'gender', 'phone', 'whatsapp', 'messenger', 'address',
    'notes', 'created_at', 'updated_at', 'deleted_at',
  ],
  calendar_events: [
    'user_id', 'id', 'title', 'type', 'color', 'date', 'start_time', 'end_time',
    'notes', 'recurring', 'recurring_rule', 'recurring_until', 'excluded_dates',
    'recurring_days', 'backup', 'people', 'contact_method', 'quantity', 'units',
    'updated_at', 'deleted_at',
  ],
  goal_definitions: [
    'user_id', 'id', 'label', 'icon', 'icon_family', 'color',
    'visible', 'monthly_visible', 'built_in', 'sort_order', 'monthly_sort_order',
    'removed', 'updated_at', 'deleted_at',
  ],
  event_type_definitions: [
    'user_id', 'id', 'label',
    'visible', 'built_in', 'goal_id', 'goal_mode', 'late_goal_id', 'goal_split_time',
    'report_style', 'sort_order', 'removed', 'updated_at', 'deleted_at',
  ],
  goal_entries: [
    'user_id', 'goal_id', 'week_key', 'count', 'target', 'updated_at', 'deleted_at',
  ],
  goal_monthly_entries: [
    'user_id', 'goal_id', 'month_key', 'count', 'target', 'updated_at', 'deleted_at',
  ],
  event_statuses: [
    'user_id', 'event_id', 'occurrence_date', 'status', 'updated_at', 'deleted_at',
  ],
  convert_progress: [
    'user_id', 'id', 'completed', 'updated_at', 'deleted_at',
  ],
  settings: [
    'user_id', 'week_start', 'theme', 'language', 'time_format', 'theme_color',
    'secondary_color_light', 'secondary_color_dark',
    'tertiary_color_light', 'tertiary_color_dark',
    'grid_start_hour', 'grid_end_hour',
    'event_size', 'event_type_colors', 'event_type_default_minutes', 'quick_add_types',
    'default_country_code', 'default_contact_method', 'maps_app',
    'daily_review_enabled', 'daily_review_hour', 'daily_review_minute',
    'event_reminder_enabled', 'event_reminder_minutes', 'event_reminder_excluded_type_ids', 'updated_at',
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
  event_type_definitions: ['user_id', 'id'],
  goal_entries: ['user_id', 'goal_id', 'week_key'],
  goal_monthly_entries: ['user_id', 'goal_id', 'month_key'],
  event_statuses: ['user_id', 'event_id', 'occurrence_date'],
  settings: ['user_id'],
  convert_progress: ['user_id', 'id'],
};

/**
 * Columns whose `null` is a value rather than an absence, so fromRow keeps it
 * instead of skipping it.
 *
 * An event type's goal link is the one case. A stored definition is merged *over*
 * the type's shipped default (mergeWithDefaults), so a missing goal_id re-seeds
 * the built-in's link while an explicit null is what says the user unlinked it.
 * Skipping the null — the right default everywhere else, where it only ever means
 * "the server has nothing to add" — would hand the link back on the next pull.
 */
const NULLABLE_COLUMNS: Record<string, string[]> = {
  event_type_definitions: ['goal_id', 'late_goal_id', 'goal_split_time'],
};

/**
 * Columns that are `not null` server-side, with the value to substitute if a
 * caller's row still has `null` there. Covers not just future callers but
 * ops already sitting in the persisted sync queue from before a caller was
 * fixed — toRow runs at send time, so this heals them too without a retry
 * ever needing to know why the value was wrong.
 */
const NOT_NULL_DEFAULTS: Record<string, Record<string, unknown>> = {
  goal_definitions: { removed: false },
  event_type_definitions: { removed: false },
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

  const notNullDefaults = NOT_NULL_DEFAULTS[table];
  if (notNullDefaults) {
    for (const [column, fallback] of Object.entries(notNullDefaults)) {
      if (row[column] === null) row[column] = fallback;
    }
  }
  return row;
}

/**
 * db row -> local shape. Drops sync bookkeeping the UI has no use for, and skips
 * nulls so a null server column can't clobber a value the client already holds —
 * except for the columns where a null is itself the answer, see NULLABLE_COLUMNS.
 */
export function fromRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const reverse = invert(FIELD_MAPS[table] ?? {});
  const keepNull = NULLABLE_COLUMNS[table] ?? [];
  const local: Record<string, unknown> = {};

  for (const [column, value] of Object.entries(row)) {
    if (column === 'user_id' || column === 'updated_at' || column === 'deleted_at') continue;
    const key = reverse[column] ?? column;
    if (value !== null || keepNull.includes(column)) local[key] = value;
  }
  return local;
}
