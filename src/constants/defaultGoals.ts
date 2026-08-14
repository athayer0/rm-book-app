/** The grid only has room for so many before it turns into a wall of cards. */
export const MAX_VISIBLE_GOALS = 10;

export interface GoalDefinition {
  id: string;
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  visible: boolean;
  builtIn: boolean;
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
    builtIn: true,
  },
  {
    id: 'nightly_prayer',
    label: 'Nightly Prayers',
    icon: 'moon',
    iconFamily: 'Ionicons',
    color: '#5E35B1',
    visible: true,
    builtIn: true,
  },
  {
    id: 'times_exercised',
    label: 'Times Exercised',
    icon: 'barbell-outline',
    iconFamily: 'Ionicons',
    color: '#8B5A2B',
    visible: true,
    builtIn: true,
  },
  {
    id: 'personal_study',
    label: 'Personal Study',
    icon: 'book-outline',
    iconFamily: 'Ionicons',
    color: '#9B59B6',
    visible: true,
    builtIn: true,
  },
  {
    id: 'total_dates',
    label: 'Total Dates',
    icon: 'heart',
    iconFamily: 'Ionicons',
    color: '#E05C6B',
    visible: true,
    builtIn: true,
  },
  {
    id: 'service_hours',
    label: 'Service Hours',
    icon: 'hand-heart',
    iconFamily: 'MaterialCommunityIcons',
    color: '#1A3A6B',
    visible: true,
    builtIn: true,
  },
  {
    id: 'church_hours',
    label: 'Church Hours',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#8B1A4A',
    visible: true,
    builtIn: true,
  },
  {
    id: 'temple_attendance',
    label: 'Temple Trips',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#00B5C8',
    visible: true,
    builtIn: true,
  },
];
