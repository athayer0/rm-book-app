import type { TFunction } from 'i18next';
import { EventColors, EventTypeLabels } from './colors';

/**
 * Where a split pair divides, unless the user moves it. 2 PM reproduces the
 * boundary prayer's hardcoded morning/nightly split used, so seeding that pair
 * as ordinary data changes nothing about what an existing prayer event counts
 * toward.
 */
export const DEFAULT_GOAL_SPLIT_TIME = '2:00 PM';

/** The type picker only has room for so many before it turns into a wall of rows. */
export const MAX_EVENT_TYPES = 20;

export interface EventTypeDefinition {
  id: string;
  label: string;
  builtIn: boolean;
  /**
   * The goal this type's completions contribute to, count or hours — or, when
   * the type splits by time of day, the goal the earlier half counts toward.
   *
   * `null` is a deliberate "no goal", and is not interchangeable with an unset
   * `undefined`. A built-in's stored fields are merged *over* its shipped
   * defaults (mergeWithDefaults), so an absent key re-seeds the link from
   * BUILTIN_GOAL_LINKS — which means unlinking has to persist as a value, and
   * `undefined` isn't one: JSON.stringify drops the key, and the next read
   * would hand the link straight back.
   */
  goalId?: string | null;
  /**
   * +1 per completion, the event's duration in hours, or the event's own
   * `quantity` field. Defaults to 'count'. Shared by both halves of a split
   * pair: a goal divided by time of day is the same measurement on either side
   * of the cutoff, so there is nothing for a second mode to describe.
   */
  goalMode?: 'count' | 'hours' | 'quantity';
  /**
   * The goal completions at or after `goalSplitTime` count toward instead, so
   * one type can feed a morning/evening pair — what prayer's morning/nightly
   * goals were a hardcoded exception in getGoalContribution() for, until these
   * two fields made the split ordinary data any type can carry.
   *
   * Can be unset while `goalSplitTime` is set: that's a Day/Night type whose
   * evening goal hasn't been picked yet, and every completion counts toward
   * `goalId` until it is. Same `null`-means-none rule as `goalId`.
   */
  lateGoalId?: string | null;
  /**
   * Where the two halves divide, in the "2:00 PM" form every other time field in
   * the app speaks.
   *
   * **Set is what makes a link a day/night pair** — it is the flag as well as
   * the time, which is why the Goal Count Type control's Day/Night option can be
   * chosen before there's an evening goal to divide anything with. The
   * alternative was a fourth `goalMode`, but Day/Night isn't a fourth way of
   * measuring: it counts completions exactly as 'count' does, and would have had
   * to be translated back into one at every reader.
   */
  goalSplitTime?: string | null;
  /**
   * Whether — and how — completing an event of this type shows a status
   * control at all: a checkbox, the failed/pending/completed picker, or none.
   * Independent of goalId/goalMode — a type can be status-reportable without
   * feeding any goal, or goal-linked with reportStyle 'none' (which just means
   * it can never actually be marked completed, so it never contributes).
   * Defaults to 'status' for customs, seeded per-id for built-ins — see
   * BUILTIN_REPORT_STYLES.
   */
  reportStyle?: 'checkbox' | 'status' | 'none';
  /**
   * This type's position in every vertical list it appears in (the type
   * picker, the quick-add list, ...) — one shared order, unlike a goal's pair,
   * since a type isn't split across two independent grids. Sorted ascending by
   * useEventTypeDefinitions, centrally, so no consumer sorts its own copy.
   */
  order: number;
  /**
   * Tombstone, not a removal from the array — see the matching field on
   * GoalDefinition for why.
   */
  removed?: boolean;
}

/**
 * Built from the existing EventColors/EventTypeLabels tables, so display order
 * matches the spectrum order already established there — see the comment on
 * EventColors in colors.ts.
 *
 * No icon here: a type has no icon of its own. The only place an icon is ever
 * shown is a quick-add bubble on the calendar's + — icons there are set per
 * selection in Settings > Quick Add (settings.quickAddTypes), not per type.
 */
export const DEFAULT_EVENT_TYPES: EventTypeDefinition[] = Object.keys(EventColors).map((id, order) => ({
  id,
  label: EventTypeLabels[id],
  builtIn: true,
  order,
}));

/**
 * The label to show for a type, for read-only display only — never for an edit
 * input's value, and never for an equality check against the shipped default
 * (see isStockBuiltInType in SettingsScreen.tsx).
 *
 * `label` is user-editable data, not a fixed constant: a built-in's stored
 * label is merged over its shipped default, and the user can rename it via
 * EventTypesModal. Translating it unconditionally would show a translated
 * string as a rename input's starting value, and saving would persist that
 * translated text as the new permanent label — so this only substitutes a
 * translation when the type is still built-in AND its label still matches
 * what shipped, i.e. nobody has renamed it.
 */
export function eventTypeDisplayLabel(def: EventTypeDefinition, t: TFunction): string {
  return def.builtIn && def.label === EventTypeLabels[def.id]
    ? t(`eventTypes.${def.id}`, { defaultValue: def.label })
    : def.label;
}

/**
 * The built-in event-type-to-goal links that used to be a hardcoded switch in
 * getGoalContribution(). Seeded as each type's default goalId/goalMode so they
 * behave exactly like a custom link — editable, deletable, unlinkable — while
 * starting out wired the way the app has always shipped.
 *
 * `prayer` is now one of them. It splits across two goals by time of day, which
 * is why it used to be the one type with no entry here and a hardcoded fallback
 * in getGoalContribution() instead — but a split is expressible as data now
 * (lateGoalId + goalSplitTime), so its wiring is a default like every other
 * type's. Nothing hardcodes 'morning_prayer'/'nightly_prayer' anymore: delete
 * either goal, or the prayer type itself, and the pair can be rebuilt from the
 * Event Types sheet — as can any other morning/evening pair someone invents.
 *
 * `contact` never contributed to a goal and stays that way.
 */
export const BUILTIN_GOAL_LINKS: Record<string, {
  goalId: string;
  goalMode: 'count' | 'hours' | 'quantity';
  lateGoalId?: string;
  goalSplitTime?: string;
}> = {
  prayer: {
    goalId: 'morning_prayer',
    goalMode: 'count',
    lateGoalId: 'nightly_prayer',
    goalSplitTime: DEFAULT_GOAL_SPLIT_TIME,
  },
  temple: { goalId: 'temple_attendance', goalMode: 'count' },
  church: { goalId: 'church_hours', goalMode: 'count' },
  service: { goalId: 'service_hours', goalMode: 'hours' },
  scripture: { goalId: 'personal_study', goalMode: 'count' },
  exercise: { goalId: 'times_exercised', goalMode: 'count' },
  date: { goalId: 'total_dates', goalMode: 'count' },
};

/**
 * Built-in defaults for `reportStyle`, reproducing exactly what the old
 * hardcoded TRACKABLE_TYPES set (in eventUtils.ts) plus EventTypeConfig's
 * `hasCheckbox` used to encode: `task` was the one checkbox type, eight types
 * were status-reportable without contributing to anything (prayer et al. plus
 * `contact`, which is trackable but not goal-counted), and everything else
 * (travel, meal, activity, work, school, other) had no status row at all —
 * which is what an id absent from this table defaults to.
 */
export const BUILTIN_REPORT_STYLES: Record<string, 'checkbox' | 'status' | 'none'> = {
  task: 'checkbox',
  prayer: 'status',
  temple: 'status',
  church: 'status',
  scripture: 'status',
  exercise: 'status',
  service: 'status',
  date: 'status',
  contact: 'status',
};
