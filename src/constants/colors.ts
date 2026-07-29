export const LightColors = {
  primary: '#8B1A4A',
  accent: '#00B5C8',
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textLight: '#999999',
  border: '#E5E5E5',
  success: '#27AE60',
  danger: '#E74C3C',
  white: '#FFFFFF',
  tabBar: '#EFEFEF',
  tabBarInactive: '#888888',
  shadow: 'rgba(0,0,0,0.08)',
  modalBackdrop: 'rgba(0,0,0,0.35)',
  weekStripBg: '#E8E8E8',
  weekStripBgAlt: '#D8D8D8',
  selectedDayBg: '#D4E8F5',
  selectedDayBorder: '#253960',
  rowPressedBg: 'rgba(160,160,160,0.2)',
  // Navy, for tappable text actions in the goal screens ("Set goals", "Add a Goal +").
  goalTextAction: '#253960',
  // Navy fill behind a white label. Stays dark in both themes so the label keeps contrast.
  goalActionBg: '#253960',
  statusOtherColor: '#000000',
};

export const DarkColors: typeof LightColors = {
  primary: '#8B1A4A',
  accent: '#00B5C8',
  background: '#111111',
  card: '#1E1E1E',
  text: '#F0F0F0',
  textSecondary: '#DDDDDD',
  textLight: '#FFFFFF',
  border: '#2C2C2C',
  success: '#27AE60',
  danger: '#E74C3C',
  white: '#FFFFFF',
  tabBar: '#1A1A1A',
  tabBarInactive: '#FFFFFF',
  shadow: 'rgba(0,0,0,0.4)',
  modalBackdrop: 'rgba(0,0,0,0.6)',
  weekStripBg: '#1A1A1A',
  weekStripBgAlt: '#141414',
  selectedDayBg: '#263040',
  selectedDayBorder: '#8AAFC8',
  rowPressedBg: 'rgba(160,160,160,0.2)',
  // Navy is unreadable on the dark background; lift it the same way selectedDayBorder does.
  goalTextAction: '#8AAFC8',
  // A fill, not text — navy still reads against the dark card and keeps its white label legible.
  goalActionBg: '#2E4877',
  statusOtherColor: '#FFFFFF',
};

export type ColorPalette = typeof LightColors;

// The palette offered by every colour picker (goal icons, event types). Ordered by hue —
// red through violet — with the low-saturation browns and grey trailing, since they have
// no place on the spectrum. Rendered as two rows of eight.
export const SwatchColors: string[] = [
  '#E74C3C', // red
  '#E05C6B', // rose
  '#800000', // maroon
  '#D2691E', // chocolate
  '#E8980E', // orange
  '#E8B820', // yellow
  '#2ECC71', // green
  '#27AE60', // deep green
  '#00B5C8', // cyan
  '#2979FF', // blue
  '#1A3A6B', // navy
  '#A29BFE', // periwinkle
  '#9B59B6', // violet
  '#795548', // brown
  '#616161', // dark grey
  '#BDBDBD', // light grey
];

export const EventColors: Record<string, string> = {
  church:    '#E05C6B',
  travel:    '#800000',
  meal:      '#D2691E',
  activity:  '#E8B820',
  work:      '#2ECC71',
  service:   '#1A3A6B',
  school:    '#2979FF',
  temple:    '#00B5C8',
  prayer:    '#A29BFE',
  scripture: '#9B59B6',
  exercise:  '#616161',
  other:     '#BDBDBD',
  task:      '#795548',
};

export const EventTypeLabels: Record<string, string> = {
  church:    'Church',
  travel:    'Travel',
  meal:      'Meal',
  activity:  'Activity',
  work:      'Work',
  service:   'Service',
  school:    'School',
  temple:    'Temple',
  prayer:    'Prayer',
  scripture: 'Scripture Study',
  exercise:  'Exercise',
  other:     'Other',
  task:      'Task',
};

export const EventTypeConfig: Record<string, { defaultMinutes: number; hasCheckbox: boolean }> = {
  church:    { defaultMinutes: 30, hasCheckbox: false },
  travel:    { defaultMinutes: 30, hasCheckbox: false },
  meal:      { defaultMinutes: 30, hasCheckbox: false },
  activity:  { defaultMinutes: 30, hasCheckbox: false },
  work:      { defaultMinutes: 30, hasCheckbox: false },
  service:   { defaultMinutes: 30, hasCheckbox: false },
  school:    { defaultMinutes: 30, hasCheckbox: false },
  temple:    { defaultMinutes: 30, hasCheckbox: false },
  prayer:    { defaultMinutes: 0, hasCheckbox: true },
  scripture: { defaultMinutes: 30, hasCheckbox: false },
  exercise:  { defaultMinutes: 30, hasCheckbox: false },
  other:     { defaultMinutes: 30, hasCheckbox: false },
  task:      { defaultMinutes: 0, hasCheckbox: true },
};
