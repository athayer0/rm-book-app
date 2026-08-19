/**
 * The crimson the app shipped with. `primary` is a setting, so this is only
 * the starting point: `useColors` swaps in the user's choice, and everything
 * that reads `primary` (headers, the active tab pill, the now-line) follows.
 */
export const DEFAULT_THEME_COLOR = '#8B1A4A';

// Defaults for the other two user-editable theme colors — light/dark are
// independent settings, not a lift computed from one value, so each needs its
// own default. These match today's hardcoded `accent`/`control` values exactly,
// so picking neither leaves the app looking exactly as it does today.
export const DEFAULT_SECONDARY_COLOR_LIGHT = '#00B5C8';
export const DEFAULT_SECONDARY_COLOR_DARK = '#00B5C8';
export const DEFAULT_TERTIARY_COLOR_LIGHT = '#1A3A6B';
export const DEFAULT_TERTIARY_COLOR_DARK = '#8AAFC8';

// Same independent-per-theme treatment as secondary/tertiary above, for the
// three event-reporting status colours — see the `statusCompleted` etc.
// tokens below, and `useColors`, which overrides them from these settings.
export const DEFAULT_STATUS_COMPLETED_LIGHT = '#1A7A40';
export const DEFAULT_STATUS_COMPLETED_DARK = '#3FB56B';
export const DEFAULT_STATUS_FAILED_LIGHT = '#B03030';
export const DEFAULT_STATUS_FAILED_DARK = '#E36A6A';
export const DEFAULT_STATUS_PENDING_LIGHT = '#E8980E';
export const DEFAULT_STATUS_PENDING_DARK = '#F5B33C';

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
  // event type and the Service Hours goal (both #1A3A6B), not the
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
  // the goal sheets, "Add Event Type" in the types sheet. Named for where it
  // started. The two editors' add-rows ("Add Person", "Add contact method",
  // "Add address") ask for `control` directly instead, which comes to the same
  // thing: useColors derives this token *from* control, so the two can never
  // differ. Worth collapsing if anything ever needs them to.
  goalTextAction: '#1A3A6B',
  // Navy fill behind a white label. Stays dark in both themes so the label keeps contrast.
  goalActionBg: '#1A3A6B',
  statusOtherColor: '#000000',
  // Tint behind the call and message buttons, so the `control` glyph sits on a
  // soft wash of its own colour rather than the bare card.
  contactActionBg: '#E1E5EC',
  // A filled pill holding one piece of secondary metadata on a card — today the
  // recurrence rule on an event. Neutral rather than tinted, since it states a
  // fact rather than offering an action, and it must not compete with the
  // colour-carrying rows above it. In dark mode it sits *lighter* than `card`
  // for the same reason a menu does: a darker fill on a dark card reads as a
  // hole punched in the surface rather than as a chip resting on it.
  infoChipBg: '#F0F2F5',
  // Free-text fields (an event's title and notes). These are filled boxes rather
  // than the underlined rows the pickers use: an underline says "a value sits
  // here", which is all a picker needs, but a box says "type into this", and a
  // multi-line notes field with only a rule under its last line has no shape at
  // all until you fill it. Near-identical to `infoChipBg` in light mode by
  // coincidence of both being a quiet step off white — they are separate tokens
  // because one is a control and the other is a label, and only one of them
  // should follow if the form's fields are ever restyled.
  inputBg: '#F1F3F6',
  inputBorder: '#E3E6EA',
  // Skeleton placeholder blocks (Home's loading state right after onboarding
  // commits its writes in the background). A step off `card`, the same
  // direction `infoChipBg` takes, so a pulsing block reads as sitting on the
  // card rather than as a hole in it.
  skeletonBase: '#E7E7E9',
  // Event reporting states, shared by the calendar's status badges and the
  // unreported-events shortcut. Centralised because two features have to agree:
  // an amber dot on the home row must mean the same thing as one on a block.
  statusCompleted: DEFAULT_STATUS_COMPLETED_LIGHT,
  statusFailed: DEFAULT_STATUS_FAILED_LIGHT,
  statusPending: DEFAULT_STATUS_PENDING_LIGHT,
  // Dimmed behind the FAB's quick-add stack. Lighter than modalBackdrop: the
  // stack is a menu hanging off a button, not a sheet, so the calendar under it
  // should still read as the thing you are adding to.
  fabScrim: 'rgba(0,0,0,0.20)',
  // Dropdown menus (see src/components/DropdownMenu.tsx). Separate from `card`
  // and `border` because a menu is not a card: it floats above one, so in dark
  // mode it has to be *lighter* than the surface it covers, and its hairlines
  // are finer than the rules that divide a card's rows.
  //
  // A step off `card` rather than equal to it: almost every menu in the app
  // opens over a card, and white landing on white left the edge and shadow
  // doing all the work of saying "this is a separate surface."
  menuSurface: '#FAFAFA',
  menuSeparator: 'rgba(60,60,67,0.13)',
  // Deliberately heavier than menuSeparator: this is the boundary of the whole
  // panel, and an edge drawn at the same weight as the rules between its rows
  // stops the panel reading as one object.
  menuBorder: 'rgba(60,60,67,0.20)',
  menuPressedBg: 'rgba(0,0,0,0.055)',
  // Deliberately stronger than `shadow` (which lifts a card by a hair): a menu
  // reads as detached from the page, not merely raised off it.
  menuShadow: 'rgba(0,0,0,0.28)',
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
  // Lifted off `card` (#1E1E1E), not sunk below it — see the light-mode note.
  infoChipBg: '#2A2A2C',
  // Lifted off `card` for the same reason infoChipBg is, and the edge carries
  // more of the shape here than in light mode, where the fill alone reads.
  inputBg: '#262628',
  inputBorder: '#333336',
  // Lifted further off `card` than infoChipBg, since the pulse needs to read
  // even at its dimmest point against a near-black card.
  skeletonBase: '#3A3A3C',
  // Lifted from the light values, which are mid-tones chosen against white and
  // go muddy on a dark card. Hue is preserved so the states stay recognisable.
  statusCompleted: DEFAULT_STATUS_COMPLETED_DARK,
  statusFailed: DEFAULT_STATUS_FAILED_DARK,
  statusPending: DEFAULT_STATUS_PENDING_DARK,
  // Deeper than the light value for the same reason modalBackdrop is: the same
  // alpha that dims a white calendar leaves a near-black one looking untouched.
  fabScrim: 'rgba(0,0,0,0.50)',
  // Lighter than `card` (#1E1E1E), not darker — the inverted-surface rule only
  // holds for cards sitting *in* the page. A menu floats above the card, and
  // depth in dark mode is read as lift, so it has to come forward.
  menuSurface: '#2C2C2E',
  menuSeparator: 'rgba(255,255,255,0.14)',
  // Load-bearing in a way it only assists with in light mode: a black shadow on
  // a near-black background does almost nothing, so this hairline is most of
  // what separates the menu from whatever it covers.
  //
  // Lifted along with the light value, but by less. Dark already has a surface
  // that stands off `card` on its own, which light has none of, so it needs
  // less edge to say the same thing — pushed to light's weight it would read as
  // a drawn outline rather than a lit edge.
  menuBorder: 'rgba(255,255,255,0.16)',
  menuPressedBg: 'rgba(255,255,255,0.09)',
  menuShadow: 'rgba(0,0,0,0.70)',
};

export type ColorPalette = typeof LightColors;

/**
 * What a goal the user adds starts out as. Named rather than read off the first
 * entry of a palette array, which is what it used to be: that made a new goal's
 * colour a side effect of how the list happened to be sorted, so reordering it
 * silently repainted every goal added afterwards.
 *
 * A neutral grey: every built-in goal ships with a hue of its own, so starting
 * off the wheel entirely reads as "not coloured yet" rather than as a ninth
 * colour competing with them. No built-in uses it, so a new goal is still
 * distinguishable from the eight until it's given a colour.
 *
 * Mid-grey rather than pale or near-black on purpose — it's used both as the
 * icon's own tint in light mode and, through `lightenColor`, in dark mode, so it
 * has to have somewhere to go in both directions.
 */
export const DEFAULT_GOAL_COLOR = '#8E8E93';

// Key order is the display order: SettingsScreen and AddEditEventModal both
// build their type lists with Object.keys(EventColors). EventTypeLabels and
// EventTypeConfig are kept in the same order so the three read as one table.
//
// The order tracks each type's own colour by hue — warm through cool, then the
// browns and the grey — so the list reads as a spectrum rather than an arbitrary
// order. A new type belongs wherever its colour falls, not at the end. The muted
// tail has no hue to sort on, so it ramps by lightness instead, ending on the
// neutral grey.
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
