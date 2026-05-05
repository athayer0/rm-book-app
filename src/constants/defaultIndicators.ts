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
    id: 'scripture_study',
    label: 'Scripture Study',
    icon: 'book',
    iconFamily: 'Ionicons',
    goal: 7,
    type: 'daily',
    color: '#00B5C8',
    visible: true,
    builtIn: true,
  },
  {
    id: 'temple_visits',
    label: 'Temple Visits',
    icon: 'home',
    iconFamily: 'Ionicons',
    goal: 1,
    type: 'weekly',
    color: '#F0C040',
    visible: true,
    builtIn: true,
  },
  {
    id: 'church_attendance',
    label: 'Church Attendance',
    icon: 'people',
    iconFamily: 'Ionicons',
    goal: 1,
    type: 'weekly',
    color: '#8B1A4A',
    visible: true,
    builtIn: true,
  },
  {
    id: 'service_hours',
    label: 'Service Hours',
    icon: 'heart',
    iconFamily: 'Ionicons',
    goal: 2,
    type: 'numeric',
    color: '#E74C3C',
    visible: true,
    builtIn: true,
  },
  {
    id: 'first_dates',
    label: 'First Dates',
    icon: 'person-add',
    iconFamily: 'Ionicons',
    goal: 2,
    type: 'numeric',
    color: '#27AE60',
    visible: true,
    builtIn: true,
  },
  {
    id: 'second_dates',
    label: 'Second Dates',
    icon: 'people-circle',
    iconFamily: 'Ionicons',
    goal: 1,
    type: 'numeric',
    color: '#3498DB',
    visible: true,
    builtIn: true,
  },
];
