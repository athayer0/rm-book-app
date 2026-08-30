import type { TFunction } from 'i18next';

/** The grid only has room for so many before it turns into a wall of cards. */
export const MAX_VISIBLE_GOALS = 12;

/**
 * Ceiling for any goal-related number a person types in by hand: a weekly/
 * monthly target, its actual/current count, or a per-event quantity. Three
 * digits is already an implausibly large single value for any of these: the
 * cap exists to stop a stray extra digit or a stuck stepper from producing a
 * number nothing downstream (grid layout, sync payloads) was sized for.
 */
export const MAX_GOAL_VALUE = 999;

export interface GoalDefinition {
  id: string;
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  /** Shown on the Home screen's weekly grid, and tracked at week grain. */
  visible: boolean;
  /**
   * The same, at month grain. Still an independent boolean, but the Goal Period
   * control in EditGoalsModal only ever writes three of the four combinations —
   * both-false means tracked nowhere, which is indistinguishable from the goal
   * not existing. `goalPeriod()` there reads any stray both-false as weekly, so
   * no migration pass is needed for definitions predating that control.
   */
  monthlyVisible: boolean;
  builtIn: boolean;
  /**
   * This goal's position in the weekly grid — independent of `monthlyOrder`,
   * since dragging a card in one grid has no bearing on where it sits in the
   * other. Sorted ascending; ties fall back to array position (see
   * sortForGrain in goalGrain.ts).
   */
  order: number;
  /** This goal's position in the monthly grid. Independent of `order` — see above. */
  monthlyOrder: number;
  /**
   * Tombstone, not a removal from the array. Built-ins are always regenerated
   * from DEFAULT_GOALS by mergeWithDefaults(), so a deleted built-in has to be
   * remembered as deleted rather than dropped, or it would reappear on the next
   * read. Customs use the same flag for consistency and so a delete actually
   * syncs (a dropped array entry never told Supabase anything).
   */
  removed?: boolean;
}

/**
 * Order matters: the grid lays these out two cards per row, so the array reads
 * left, right, left, right down the page.
 *
 * The pairs are chosen so the left column runs warm (amber, brown, pink, maroon)
 * and the right column cool (violet, purple, navy, cyan). Anything inserted here
 * shifts every card after it — keep new goals on the column their colour belongs to.
 */
/**
 * The label to show for a goal, for read-only display only — see
 * eventTypeDisplayLabel in eventTypeDefaults.ts for why: `label` is
 * user-editable (a built-in can be renamed via EditGoalsModal), so this only
 * substitutes a translation when the goal is still built-in AND unrenamed.
 */
export function goalDisplayLabel(def: GoalDefinition, t: TFunction): string {
  const shipped = DEFAULT_GOALS.find(g => g.id === def.id)?.label;
  return def.builtIn && shipped !== undefined && def.label === shipped
    ? t(`goals.${def.id}`, { defaultValue: def.label })
    : def.label;
}

export const DEFAULT_GOALS: GoalDefinition[] = [
  {
    id: 'morning_prayer',
    label: 'Morning Prayers',
    icon: 'sunny',
    iconFamily: 'Ionicons',
    color: '#E8980E',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 0,
    monthlyOrder: 0,
  },
  {
    id: 'nightly_prayer',
    label: 'Nightly Prayers',
    icon: 'moon',
    iconFamily: 'Ionicons',
    color: '#5E35B1',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 1,
    monthlyOrder: 1,
  },
  {
    id: 'times_exercised',
    label: 'Times Exercised',
    icon: 'barbell-outline',
    iconFamily: 'Ionicons',
    color: '#8B5A2B',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 2,
    monthlyOrder: 2,
  },
  {
    id: 'personal_study',
    label: 'Personal Study',
    icon: 'book-outline',
    iconFamily: 'Ionicons',
    color: '#9B59B6',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 3,
    monthlyOrder: 3,
  },
  {
    id: 'total_dates',
    label: 'Total Dates',
    icon: 'heart',
    iconFamily: 'Ionicons',
    color: '#E05C6B',
    visible: true,
    monthlyVisible: true,
    builtIn: true,
    order: 4,
    monthlyOrder: 4,
  },
  {
    id: 'service_hours',
    label: 'Service Hours',
    icon: 'hand-heart',
    iconFamily: 'MaterialCommunityIcons',
    color: '#1A3A6B',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 5,
    monthlyOrder: 5,
  },
  {
    id: 'church_hours',
    // Displays as "Church Attendance" via the goals.church_hours translation —
    // this label is kept as the original shipped text (rather than renamed to
    // match) so goalDisplayLabel's equality check still recognizes an
    // already-synced, never-renamed copy of this goal as unrenamed.
    label: 'Church Hours',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#8B1A4A',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
    order: 6,
    monthlyOrder: 6,
  },
  {
    id: 'temple_attendance',
    // Displays as "Temple Attendance" via the goals.temple_attendance
    // translation — kept as the original shipped text for the same reason as
    // church_hours above: it's what goalDisplayLabel's equality check needs to
    // still recognize an already-synced, never-renamed copy as unrenamed.
    label: 'Temple Trips',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#00B5C8',
    visible: true,
    monthlyVisible: true,
    builtIn: true,
    order: 7,
    monthlyOrder: 7,
  },
];
