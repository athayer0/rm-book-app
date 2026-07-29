export interface GoalDefinition {
  id: string;
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  visible: boolean;
  builtIn: boolean;
}

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
    color: '#1A3A6B',
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
    id: 'church_hours',
    label: 'Church Hours',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#8B1A4A',
    visible: true,
    builtIn: true,
  },
  {
    id: 'times_exercised',
    label: 'Times Exercised',
    icon: 'barbell-outline',
    iconFamily: 'Ionicons',
    color: '#616161',
    visible: true,
    builtIn: true,
  },
  {
    id: 'temple_attendance',
    label: 'Temple Attendance',
    icon: 'church',
    iconFamily: 'MaterialCommunityIcons',
    color: '#00B5C8',
    visible: true,
    builtIn: true,
  },
];
