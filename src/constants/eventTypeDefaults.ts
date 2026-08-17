import { EventColors, EventTypeLabels } from './colors';

export interface EventTypeDefinition {
  id: string;
  label: string;
  builtIn: boolean;
  /** The goal this type's completions contribute to, count or hours. */
  goalId?: string;
  /**
   * +1 per completion, the event's duration in hours, or the event's own
   * `quantity` field. Defaults to 'count'.
   */
  goalMode?: 'count' | 'hours' | 'quantity';
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
export const DEFAULT_EVENT_TYPES: EventTypeDefinition[] = Object.keys(EventColors).map(id => ({
  id,
  label: EventTypeLabels[id],
  builtIn: true,
}));

/**
 * The built-in event-type-to-goal links that used to be a hardcoded switch in
 * getGoalContribution(). Seeded as each type's default goalId/goalMode so they
 * behave exactly like a custom link — editable, deletable, unlinkable — while
 * starting out wired the way the app has always shipped.
 *
 * `prayer` is deliberately absent: it splits across two goals (morning/nightly)
 * by time of day, which doesn't fit a single goalId. It keeps a small hardcoded
 * fallback in getGoalContribution() that only applies while it carries no
 * explicit link. `contact` never contributed to a goal and stays that way.
 */
export const BUILTIN_GOAL_LINKS: Record<string, { goalId: string; goalMode: 'count' | 'hours' | 'quantity' }> = {
  temple: { goalId: 'temple_attendance', goalMode: 'count' },
  church: { goalId: 'church_hours', goalMode: 'hours' },
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
