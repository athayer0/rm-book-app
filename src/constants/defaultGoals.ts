/** The grid only has room for so many before it turns into a wall of cards. */
export const MAX_VISIBLE_GOALS = 10;

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
  visible: boolean;
  /** Shown on the Home screen's monthly grid. Independent of `visible` — a goal can be weekly, monthly, neither, or both. */
  monthlyVisible: boolean;
  builtIn: boolean;
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
  },
  {
    id: 'total_dates',
    label: 'Total Dates',
    icon: 'heart',
    iconFamily: 'Ionicons',
    color: '#E05C6B',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
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
  },
  {
    id: 'church_hours',
    label: 'Church Hours',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#8B1A4A',
    visible: true,
    monthlyVisible: false,
    builtIn: true,
  },
  {
    id: 'temple_attendance',
    label: 'Temple Trips',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#00B5C8',
    visible: true,
    monthlyVisible: true,
    builtIn: true,
  },
];
