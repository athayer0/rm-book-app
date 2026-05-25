export interface IndicatorDefinition {
  id: string;
  label: string;
  icon: string;
  iconFamily: string;
  goal: number;
  type: 'daily' | 'weekly' | 'numeric';
  color: string;
  visible: boolean;
  builtIn: boolean;
}

export const DEFAULT_INDICATORS: IndicatorDefinition[] = [
  {
    id: 'morning_prayer',
    label: 'Morning Prayers',
    icon: 'sunny',
    iconFamily: 'Ionicons',
    goal: 7,
    type: 'daily',
    color: '#F39C12',
    visible: true,
    builtIn: true,
  },
  {
    id: 'nightly_prayer',
    label: 'Nightly Prayers',
    icon: 'moon',
    iconFamily: 'Ionicons',
    goal: 7,
    type: 'daily',
    color: '#9B59B6',
    visible: true,
    builtIn: true,
  },
  {
    id: 'temple_attendance',
    label: 'Temple Attendance',
    icon: 'home',
    iconFamily: 'Ionicons',
    goal: 1,
    type: 'weekly',
    color: '#F0C040',
    visible: true,
    builtIn: true,
  },
  {
    id: 'church_hours',
    label: 'Church Hours',
    icon: 'people',
    iconFamily: 'Ionicons',
    goal: 3,
    type: 'numeric',
    color: '#8B1A4A',
    visible: true,
    builtIn: true,
  },
  {
    id: 'personal_study',
    label: 'Personal Study',
    icon: 'book-outline',
    iconFamily: 'Ionicons',
    goal: 7,
    type: 'daily',
    color: '#00B5C8',
    visible: true,
    builtIn: true,
  },
  {
    id: 'times_exercised',
    label: 'Times Exercised',
    icon: 'barbell-outline',
    iconFamily: 'Ionicons',
    goal: 3,
    type: 'numeric',
    color: '#27AE60',
    visible: true,
    builtIn: true,
  },
];
