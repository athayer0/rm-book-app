/**
 * A deep verdant green — dark enough that white lettering clears 7:1 on it, and
 * far enough from the greens in SwatchColors that a header is never mistaken for
 * an event. `primary` is a setting, so this is only the starting point:
 * `useColors` swaps in the user's choice, and everything that reads `primary`
 * (headers, the active tab pill, the now-line) follows.
 */
export const DEFAULT_THEME_COLOR = '#1B5E3F';

// Defaults for the other two user-editable theme colors — light/dark are
// independent settings, not a lift computed from one value, so each needs its
// own default. These match today's hardcoded `accent`/`control` values exactly,
// so picking neither leaves the app looking exactly as it does today.
export const DEFAULT_SECONDARY_COLOR_LIGHT = '#00B5C8';
export const DEFAULT_SECONDARY_COLOR_DARK = '#00B5C8';
export const DEFAULT_TERTIARY_COLOR_LIGHT = '#1A3A6B';
export const DEFAULT_TERTIARY_COLOR_DARK = '#8AAFC8';

export const LightColors = {
  primary: DEFAULT_THEME_COLOR,
  // Ink for anything sitting on `primary`: header titles, the active tab icon.
  // `useColors` recomputes both from the chosen theme colour's luminance, so a
  // pale header gets dark lettering instead of unreadable white. The values here
  // are what the default maroon resolves to.
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255, 255, 255, 0.8)',
  // Cyan, now reserved for committing and emphasis: Save, Done, EDIT, and the
  // goal counts. Everything that merely selects or toggles uses `control`.
  accent: '#00B5C8',
  // Navy, for the interactive furniture — checkmarks, switches, active pills and
  // tabs, the FAB, and the "add a thing" links. The same navy as the Service
  // event type and the Service Hours goal (SwatchColors' #1A3A6B), not the
  // slightly darker #253960 the goal sheets use. Lifts to a pale blue in dark
  // mode for the same reason goalTextAction does: navy on near-black is unreadable.
  control: '#1A3A6B',
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
  selectedDayBorder: '#1A3A6B',
  rowPressedBg: 'rgba(160,160,160,0.2)',
  // A row standing selected rather than merely being touched, so it has to read
  // as a state and not as the grey flash of rowPressedBg. Tinted with `control`,
  // and weighted per theme: the same alpha that reads as a wash on white
  // disappears on a dark card.
  rowSelectedBg: 'rgba(26,58,107,0.10)',
  // Navy, for the "add a thing" text actions — "Set goals" and "Add a Goal +" in
  // the goal sheets, "Add Person" on an event. Named for where it started; it is
  // now what any of those links look like.
  goalTextAction: '#1A3A6B',
  // Navy fill behind a white label. Stays dark in both themes so the label keeps contrast.
  goalActionBg: '#1A3A6B',
  statusOtherColor: '#000000',
  // Tint behind the call and message buttons, so the `control` glyph sits on a
  // soft wash of its own colour rather than the bare card.
  contactActionBg: '#E1E5EC',
  // Event reporting states, shared by the calendar's status badges and the
  // unreported-events shortcut. Centralised because two features have to agree:
  // an amber dot on the home row must mean the same thing as one on a block.
  statusCompleted: '#1A7A40',
  statusFailed: '#B03030',
  statusPending: '#E8980E',
  // The filled star on a favourited person. Amber rather than `control` so a
  // favourite reads at a glance against a row of blue action glyphs.
  favorite: '#E8980E',
  // Dimmed behind the FAB's quick-add stack. Lighter than modalBackdrop: the
  // stack is a menu hanging off a button, not a sheet, so the calendar under it
  // should still read as the thing you are adding to.
  fabScrim: 'rgba(0,0,0,0.20)',
};

export const DarkColors: typeof LightColors = {
  // Not lifted for dark mode: the header is a filled band, so it carries its own
  // contrast, and the user picks this colour to be the same in both themes.
  primary: DEFAULT_THEME_COLOR,
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255, 255, 255, 0.8)',
  accent: '#00B5C8',
  control: '#8AAFC8',
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
  // The dark-mode `control` is the pale blue, so the tint follows it there.
  rowSelectedBg: 'rgba(138,175,200,0.20)',
  // Navy is unreadable on the dark background; lift it the same way selectedDayBorder does.
  goalTextAction: '#8AAFC8',
  // A fill, not text — navy still reads against the dark card and keeps its white label legible.
  goalActionBg: '#2E4877',
  statusOtherColor: '#FFFFFF',
  // Same wash, darkened so the pale-blue glyph keeps its contrast on a dark card.
  contactActionBg: '#1C2740',
  // Lifted from the light values, which are mid-tones chosen against white and
  // go muddy on a dark card. Hue is preserved so the states stay recognisable.
  statusCompleted: '#3FB56B',
  statusFailed: '#E36A6A',
  statusPending: '#F5B33C',
  // Same lift as statusPending: the light amber goes muddy on a dark card.
  favorite: '#F5B33C',
  // Deeper than the light value for the same reason modalBackdrop is: the same
  // alpha that dims a white calendar leaves a near-black one looking untouched.
  fabScrim: 'rgba(0,0,0,0.50)',
};

export type ColorPalette = typeof LightColors;

// The stock colours: what the built-in event types and goals are born with, and
// where a new goal's colour starts. No longer a picker — colours are chosen off a
// gradient now — so this is a set of defaults rather than the set of choices.
// Ordered by hue, red through violet, with the low-saturation browns and grey
// trailing, since they have no place on the spectrum.
export const SwatchColors: string[] = [
  '#E74C3C', // red
  '#E05C6B', // rose
  '#800000', // maroon
  '#D2691E', // chocolate
  '#E8980E', // orange
  '#E8B820', // yellow
  '#7CB342', // lime
  '#1E8449', // deep green
  '#00B5C8', // cyan
  '#2979FF', // blue
  '#1A3A6B', // navy
  '#A29BFE', // periwinkle
  '#9B59B6', // violet
  '#795548', // brown
  '#8B5A2B', // mid brown
  '#A9744F', // light brown
  '#8F8F8F', // grey
];

// Key order is the display order: SettingsScreen and AddEditEventModal both
// build their type lists with Object.keys(EventColors). EventTypeLabels and
// EventTypeConfig are kept in the same order so the three read as one table.
//
// The order tracks each type's colour through SwatchColors — warm through cool,
// then the browns and the grey — so the list reads as a spectrum rather than an
// arbitrary order. A new type belongs wherever its colour falls, not at the end.
// The muted tail has no hue to sort on, so it ramps by lightness instead, ending
// on the neutral grey.
export const EventColors: Record<string, string> = {
  church:    '#E05C6B',
  travel:    '#800000',
  meal:      '#D2691E',
  activity:  '#E8980E',
  date:      '#E8B820',
  contact:   '#8FCF4A',
  work:      '#1E8449',
  temple:    '#00B5C8',
  school:    '#2979FF',
  service:   '#1A3A6B',
  prayer:    '#A29BFE',
  scripture: '#9B59B6',
  task:      '#795548',
  exercise:  '#A9744F',
  other:     '#8F8F8F',
};

export const EventTypeLabels: Record<string, string> = {
  church:    'Church',
  travel:    'Travel',
  meal:      'Meal',
  activity:  'Activity',
  date:      'Date',
  contact:   'Contact',
  work:      'Work',
  temple:    'Temple',
  school:    'School',
  service:   'Service',
  prayer:    'Prayer',
  scripture: 'Scripture Study',
  task:      'Task',
  exercise:  'Exercise',
  other:     'Other',
};

/**
 * A glyph per type, for the places a colour alone can't carry the meaning — the
 * quick-add bubbles rising off the calendar's + are five coloured circles, and
 * nobody reads chocolate-vs-rose as meal-vs-church.
 *
 * Families are mixed on purpose: Ionicons covers most of it, and the few that
 * only MaterialCommunityIcons draws well (a chapel, folded hands) are worth the
 * dispatch. `GoalIcon` handles both, so pass `iconFamily` through with `icon`.
 */
export const EventTypeIcons: Record<string, { icon: string; iconFamily?: string }> = {
  church:    { icon: 'church', iconFamily: 'MaterialCommunityIcons' },
  travel:    { icon: 'car' },
  meal:      { icon: 'restaurant' },
  activity:  { icon: 'people' },
  date:      { icon: 'heart' },
  contact:   { icon: 'chatbubble-ellipses' },
  work:      { icon: 'briefcase' },
  // The same chapel as `church`, and deliberately: the Church Hours and Temple
  // Attendance goals already share it, so a temple drawn as anything else here
  // would be the odd one out against the goal it feeds.
  temple:    { icon: 'church', iconFamily: 'MaterialCommunityIcons' },
  school:    { icon: 'school' },
  service:   { icon: 'hand-heart', iconFamily: 'MaterialCommunityIcons' },
  prayer:    { icon: 'hands-pray', iconFamily: 'MaterialCommunityIcons' },
  scripture: { icon: 'book' },
  task:      { icon: 'checkbox' },
  exercise:  { icon: 'barbell' },
  other:     { icon: 'ellipsis-horizontal' },
};

/**
 * `optionalEnd` types start with no end time at all and offer one on request,
 * rather than being handed a default duration. Distinct from `hasCheckbox`,
 * which means the type can never have an end: a contact really may have run
 * from 2:14 to 2:31, it just usually isn't worth saying so.
 */
export const EventTypeConfig: Record<string, { defaultMinutes: number; hasCheckbox: boolean; optionalEnd?: boolean }> = {
  church:    { defaultMinutes: 120, hasCheckbox: false },
  travel:    { defaultMinutes: 30, hasCheckbox: false },
  meal:      { defaultMinutes: 30, hasCheckbox: false },
  activity:  { defaultMinutes: 30, hasCheckbox: false },
  date:      { defaultMinutes: 60, hasCheckbox: false },
  contact:   { defaultMinutes: 0, hasCheckbox: false, optionalEnd: true },
  work:      { defaultMinutes: 30, hasCheckbox: false },
  temple:    { defaultMinutes: 120, hasCheckbox: false },
  school:    { defaultMinutes: 30, hasCheckbox: false },
  service:   { defaultMinutes: 30, hasCheckbox: false },
  prayer:    { defaultMinutes: 15, hasCheckbox: false },
  scripture: { defaultMinutes: 30, hasCheckbox: false },
  task:      { defaultMinutes: 0, hasCheckbox: true },
  exercise:  { defaultMinutes: 30, hasCheckbox: false },
  other:     { defaultMinutes: 30, hasCheckbox: false },
};
