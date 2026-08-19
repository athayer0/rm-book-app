import { EventColors } from './colors';
import { DEFAULT_GOALS } from './defaultGoals';

/**
 * Named, ready-made palettes offered on the Event Types / Goals onboarding
 * pages so a new user can pick a "look" instead of leaving every built-in on
 * its shipped colour or hand-tuning fifteen swatches one at a time. Each
 * covers every built-in id at that page's grain — a scheme with a gap would
 * leave some rows on the old colour and silently look unfinished.
 *
 * Picking one only ever overwrites built-in ids: a custom event type or goal
 * has no entry here and keeps whatever colour it was given.
 */
export interface EventColorScheme {
  id: string;
  label: string;
  /** Keyed by event type id — see DEFAULT_EVENT_TYPES in eventTypeDefaults.ts. */
  colors: Record<string, string>;
}

export interface GoalColorScheme {
  id: string;
  label: string;
  /** Keyed by goal id — see DEFAULT_GOALS in defaultGoals.ts. */
  colors: Record<string, string>;
}

/**
 * `classic` is built from the live tables rather than re-typed, so the
 * "leave it as it ships" option can never drift from what it's describing.
 *
 * Amazon is three families — river-brown (church, meal, prayer), a
 * six-step canopy green (activity, contact, work, service, exercise, task),
 * and blackwater/morpho blue (temple, travel, school) — plus scripture's
 * teal and date/other's olive-haze pair as holdover accents, sitting in the
 * gaps between families rather than a fourth and fifth family of their own.
 * Sunset and Marine are each
 * even families rather than an abstract hue rule: Sunset is five families
 * of three — burnt orange (church, work, contact), gold (activity, task,
 * date), red (travel, meal, exercise), navy (temple, service, school), and
 * magenta (prayer, scripture, other); Marine is four families — beige
 * (travel, task, meal, contact), light blue (scripture, school, other,
 * date), navy blue (service, temple, work, church), and dark green (prayer,
 * activity, exercise) — each family its own lightness/saturation ladder
 * rather than a warm/cool mix. Wildflower is a muted pink/green/blue/yellow
 * garden mix.
 *
 * Within a scheme, colours that share a family are stepped along one ladder
 * rather than picked independently, so two greens that would otherwise land
 * close enough to blur together instead read as two clearly different
 * shades of the same family. Sunset, Marine, and Wildflower step lightness/
 * saturation only, holding each family to one constant hue; Amazon spreads
 * its families' hues evenly across their steps too (river-browns 18°-42°,
 * canopy greens 95°-145°, blackwater/morpho blues 195°-230°), so a family
 * reads as a small gradient — bark down to river-sand, forest floor up to
 * sunlit canopy, river depths up to morpho-butterfly blue — rather than one
 * hue repeated at different brightnesses.
 */
export const EVENT_COLOR_SCHEMES: EventColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    colors: { ...EventColors },
  },
  {
    // Four families of three or four, each its own lightness ladder rather
    // than independently-picked shades: beige (travel darkest, task, meal,
    // contact lightest/golden), light blue (scripture darkest, school —
    // also the theme's primary — other, date lightest/palest, also the
    // theme's tertiary-dark lift), navy blue (service near-black, temple —
    // also the theme's tertiary — work, church lightest), and dark green
    // (prayer darkest, activity, exercise lightest). The theme scheme's
    // secondary is its own aquamarine rather than a shade from this beige
    // family. Every colour's saturation is pushed well up from the original
    // muted set — lightness untouched, so the ladders above (and each
    // family's ordering along them) are unchanged, just louder.
    id: 'marine',
    label: 'Marine',
    colors: {
      church: '#124CAF',
      travel: '#7E5B1B',
      meal: '#DBA74C',
      activity: '#127D50',
      date: '#9BCFF2',
      contact: '#E8BF7D',
      work: '#0D3C8C',
      temple: '#082C68',
      school: '#55ABE7',
      service: '#051C43',
      prayer: '#0D643F',
      scripture: '#6680CC',
      task: '#A97723',
      exercise: '#179660',
      other: '#73B6E7',
    },
  },
  {
    // Five families of three, each its own lightness ladder rather than
    // independently-picked shades: burnt orange (church the primary shade,
    // work darker, contact lighter), gold (activity the secondary shade,
    // task darker/mustard, date lighter/pale), red (travel darkest, meal
    // mid, exercise brightest), navy (service near-black, temple mid —
    // also the theme's tertiary — school lightest), and magenta (other
    // darkest/plum, scripture mid, prayer brightest). church/activity/
    // temple double as the theme scheme's primary/secondary/tertiary below,
    // so the two pages read as one identity rather than two color choices
    // that happen to share a name.
    id: 'sunset',
    label: 'Sunset',
    colors: {
      church: '#B8571E',
      travel: '#6E1A12',
      meal: '#A5281D',
      activity: '#E3AE1C',
      date: '#EDC55A',
      contact: '#DD7A40',
      work: '#783A17',
      temple: '#263D5E',
      school: '#3F5E8D',
      service: '#121E30',
      prayer: '#D04395',
      scripture: '#A92371',
      task: '#A07C18',
      exercise: '#D83F31',
      other: '#6D1749',
    },
  },
  {
    // travel and task are a blue and a green rather than two of five
    // browns, each a shade the scheme didn't already have, which leaves
    // three families instead of one flat brown/green split: river-brown
    // (church, meal, prayer), a six-step canopy-green ladder (service's
    // near-black forest floor up through contact's dappled light green,
    // task slotted in at the lighter end), and blackwater/morpho blue
    // (temple, travel, school). Every family's hue is spread evenly across
    // its own steps rather than held constant — browns 18°-42°, greens
    // 95°-145°, blues 195°-230°, each ~12-15° apart — so hue does as much
    // of the telling-apart as lightness does, and the three families
    // themselves land roughly a third of the wheel apart (brown/green/
    // blue). scripture and date/other used to be a stark orchid purple and
    // two flat, barely-saturated greys sitting outside all three families —
    // scripture now sits in the ~50° gap between the green and blue
    // families instead (a teal accent, still clearly its own hue), and
    // date/other now sit in the ~50° gap between brown and green (a light
    // and a medium olive-haze pair) rather than the near-brown, washed-out
    // grey they used to read as.
    id: 'amazon',
    label: 'Amazon',
    colors: {
      church: '#5C3319',
      travel: '#2F6E85',
      meal: '#8F5A28',
      activity: '#4F9A3C',
      date: '#CCCFAA',
      contact: '#A8D89C',
      work: '#2C5B1E',
      temple: '#1D4A54',
      school: '#3B5FC4',
      service: '#1E3B17',
      prayer: '#C99A3E',
      scripture: '#479E90',
      task: '#7CB86A',
      exercise: '#357E28',
      other: '#858958',
    },
  },
  {
    id: 'wildflower',
    label: 'Wildflower',
    colors: {
      church: '#D98CA3',
      travel: '#5E7FA8',
      meal: '#E0C468',
      activity: '#7FB88F',
      date: '#ECD488',
      contact: '#92C49E',
      work: '#4F7A63',
      temple: '#6B93C2',
      school: '#93B8E0',
      service: '#3F5C82',
      prayer: '#C97C91',
      scripture: '#B8688A',
      task: '#B79A4E',
      exercise: '#5FA37E',
      other: '#C4A8B4',
    },
  },
];

/** Same five moods as EVENT_COLOR_SCHEMES, tuned separately for the eight goal ids. */
export const GOAL_COLOR_SCHEMES: GoalColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    colors: Object.fromEntries(DEFAULT_GOALS.map(g => [g.id, g.color])),
  },
  {
    // Same four families as the event scheme (light blue, navy blue, dark
    // green, beige), but tuned fresh rather than lifted straight from
    // EVENT_COLOR_SCHEMES: goal cards are a bigger, flatter swatch than an
    // event dot, so the muted/near-black event shades read as dull here.
    // Saturation is pushed up across the board — further still than the
    // original tuning, same as the event scheme's own bump — and the
    // light-blue/navy trios are spread further apart in lightness (16/26/42
    // for navy, 52/60/72 for light blue) so the three-of-a-family goals
    // stay obviously distinct instead of three near-identical blues.
    id: 'marine',
    label: 'Marine',
    colors: {
      morning_prayer: '#80C2EF',
      nightly_prayer: '#0A2147',
      times_exercised: '#17A067',
      personal_study: '#2195E9',
      total_dates: '#1E56B9',
      service_hours: '#143570',
      church_hours: '#A07222',
      temple_attendance: '#48A6EA',
    },
  },
  {
    // Same five families as the event scheme (gold, navy, red, burnt
    // orange, magenta), tuned fresh rather than lifted straight from
    // EVENT_COLOR_SCHEMES — see the note on Marine above for why. The three
    // navy goals (nightly_prayer/service_hours/temple_attendance) spread
    // from near-black up to a genuinely bright periwinkle instead of three
    // shades that all read as "dark blue."
    id: 'sunset',
    label: 'Sunset',
    colors: {
      morning_prayer: '#EFBE39',
      nightly_prayer: '#193257',
      times_exercised: '#D15D1A',
      personal_study: '#D02589',
      total_dates: '#E62B19',
      service_hours: '#2D4E80',
      church_hours: '#952318',
      temple_attendance: '#557FBE',
    },
  },
  {
    // Same families as the event scheme (nightly_prayer/total_dates/
    // church_hours river-brown, times_exercised/service_hours canopy
    // green, temple_attendance blackwater blue), tuned fresh rather than
    // lifted straight from EVENT_COLOR_SCHEMES — see the note on Marine
    // above for why, but with each hue pulled back onto the event scheme's
    // own family ladder rather than picked independently: the brown trio
    // already landed on church/meal/prayer's own hues (23°/29°/40°) so it's
    // untouched, but times_exercised and temple_attendance had drifted off
    // exercise's and temple's hues and are pulled back in line with them
    // here. morning_prayer keeps the family EVENT_COLOR_SCHEMES gives it (a
    // warm neutral rather than a brown — canopy mist rather than bark) but
    // with enough saturation to read as a colour instead of a grey.
    // personal_study used to be a stark orchid purple sitting outside every
    // family; it's a teal now, on the same hue as the event scheme's
    // scripture (in the green/blue gap), pushed more saturated the way
    // every other goal here is — goal cards are a bigger, flatter swatch
    // than an event dot, so the same restraint reads as dull rather than
    // gentle here.
    id: 'amazon',
    label: 'Amazon',
    colors: {
      morning_prayer: '#B8A576',
      nightly_prayer: '#D4A62E',
      times_exercised: '#41A82F',
      personal_study: '#42BDA8',
      total_dates: '#D0812A',
      service_hours: '#3A8C24',
      church_hours: '#8F4A1E',
      temple_attendance: '#2488A4',
    },
  },
  {
    // Same pink/green/blue/yellow garden mix as the event scheme, but with
    // saturation pushed well past the event scheme's muted-garden pastels —
    // goal cards are a bigger, flatter swatch than an event dot, so the
    // same restraint reads as dull rather than gentle here. The three blue
    // goals (nightly_prayer/personal_study/temple_attendance) spread from a
    // deep dusk blue up to a bright sky blue instead of three shades that
    // all read as "medium blue."
    id: 'wildflower',
    label: 'Wildflower',
    colors: {
      morning_prayer: '#E0C65C',
      nightly_prayer: '#274F86',
      times_exercised: '#2E9E53',
      personal_study: '#4B84D2',
      total_dates: '#D6517E',
      service_hours: '#20793E',
      church_hours: '#9E2E53',
      temple_attendance: '#83ABE2',
    },
  },
];

/**
 * Whether `resolved` (one hex per built-in id, already merged with whatever
 * customization exists) matches a known scheme exactly, so the onboarding
 * picker can show the right chip selected on open/replay instead of always
 * landing on Classic regardless of what's actually active.
 */
export function matchEventColorScheme(resolved: Record<string, string>): string | null {
  const match = EVENT_COLOR_SCHEMES.find(scheme =>
    Object.entries(scheme.colors).every(([id, hex]) => resolved[id] === hex),
  );
  return match?.id ?? null;
}

export function matchGoalColorScheme(resolved: Record<string, string>): string | null {
  const match = GOAL_COLOR_SCHEMES.find(scheme =>
    Object.entries(scheme.colors).every(([id, hex]) => resolved[id] === hex),
  );
  return match?.id ?? null;
}
