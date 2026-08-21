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
 * `other` is a fixed neutral grey in every scheme (the same `#8F8F8F`
 * Classic itself uses) rather than a shade in any family below — it's the
 * catch-all for events that aren't really any of the named types, so it
 * stays visually "uncategorized" no matter which look is picked.
 *
 * Every non-Classic scheme is still built from families — Amazon's three
 * (river-brown, canopy green, blackwater/morpho blue, plus scripture's teal
 * and date's olive-haze as holdover accents), Sunset's five (burnt orange,
 * gold, red, navy, magenta), Marine's four (beige/gold, dark green, light
 * blue, navy blue), Wildflower's four (pink, gold, green, blue) — but in
 * every one of them the *ids* are assigned by ascending hue across the
 * church/travel/meal/... list rather than grouped by family, the same
 * spectrum-by-position Classic itself reads as (see the note on EventColors
 * in colors.ts). So church no longer means "this scheme's orange/pink/blue
 * family lead" the way it does in EventColors — it means "lowest hue this
 * scheme has, other than the browns/pinks that sort to the very end the
 * same way Classic's task/exercise and Sunset's magenta pair do." Each
 * scheme's own comment below says which family a given id landed in.
 *
 * Within a scheme, colours that share a family are still stepped along one
 * lightness/saturation ladder rather than picked independently, so two
 * greens that would otherwise land close enough to blur together instead
 * read as two clearly different shades of the same family — that grouping
 * just no longer lines up with id order. Sunset, Marine, and Wildflower
 * hold each family to one constant hue; Amazon spreads its families' hues
 * evenly across their steps too (river-browns 18°-42°, canopy greens
 * 95°-145°, blackwater/morpho blues 195°-230°), so a family reads as a
 * small gradient — bark down to river-sand, forest floor up to sunlit
 * canopy, river depths up to morpho-butterfly blue — rather than one hue
 * repeated at different brightnesses.
 */
export const EVENT_COLOR_SCHEMES: EventColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    colors: { ...EventColors },
  },
  {
    // The same four families as before (beige/gold, dark green, light
    // blue, navy blue, each its own lightness ladder) — reassigned across
    // the 14 non-grey ids so the *list*, read in the same church/travel/
    // meal/... order EventColors above is declared in, runs warm-to-cool
    // like Classic's does: gold/beige lowest-hue first (church through
    // activity), then the greens (date through work), then the blues
    // (temple through exercise, ramping through the navy family into
    // scripture's near-black) — a spectrum by position rather than by
    // family membership. other, last in that order, isn't part of the
    // spectrum at all — it's the fixed neutral grey every scheme uses; see
    // the top-of-file note.
    id: 'marine',
    label: 'Marine',
    colors: {
      church: '#E8BF7D',
      travel: '#A97723',
      meal: '#DBA74C',
      activity: '#7E5B1B',
      date: '#0D643F',
      contact: '#179660',
      work: '#127D50',
      temple: '#9BCFF2',
      school: '#55ABE7',
      service: '#73B6E7',
      prayer: '#082C68',
      scripture: '#051C43',
      task: '#0D3C8C',
      exercise: '#124CAF',
      other: '#8F8F8F',
    },
  },
  {
    // The same muted garden mix as before — gold, green, blue, pink — with
    // the 14 non-grey ids reassigned in ascending-hue order: gold leads
    // (church, travel, meal), green next (activity through work), blue
    // after that (temple through prayer), and the pinks land last
    // (scripture, task, exercise) — the same tail spot the magenta family
    // sits in for Sunset and Marine, since pink is the highest-hue family
    // this scheme has.
    id: 'wildflower',
    label: 'Wildflower',
    colors: {
      church: '#B79A4E',
      travel: '#ECD488',
      meal: '#E0C468',
      activity: '#92C49E',
      date: '#7FB88F',
      contact: '#5FA37E',
      work: '#4F7A63',
      temple: '#93B8E0',
      school: '#5E7FA8',
      service: '#3F5C82',
      prayer: '#6B93C2',
      scripture: '#B8688A',
      task: '#D98CA3',
      exercise: '#C97C91',
      other: '#8F8F8F',
    },
  },
  {
    // A sixth family now: activity's dark rust (`#783A17`, the brownest of
    // the burnt-orange trio) was recoloured into a fresh indigo/purple
    // (`#5B2A8C`, hue 270°) rather than reused from elsewhere, sitting
    // right in the ~55° gap between the navy family (~216°) and the
    // magenta family (~325°) — a bridge colour, not a member of either.
    // Reassigned across the 14 non-grey ids in ascending-hue order same as
    // before: church/travel/meal still hold the reds (unaffected, all
    // lower-hue than the swap), activity/date/contact the burnt oranges,
    // work/temple/school the golds, school/service/prayer the navy trio,
    // scripture the new indigo (its hue places it right after navy, exactly
    // the bridge it was designed to be), and task/exercise the magentas,
    // unchanged at the tail.
    id: 'sunset',
    label: 'Sunset',
    colors: {
      church: '#A5281D',
      travel: '#D83F31',
      meal: '#6E1A12',
      activity: '#DD7A40',
      date: '#B8571E',
      contact: '#EDC55A',
      work: '#E3AE1C',
      temple: '#A07C18',
      school: '#263D5E',
      service: '#121E30',
      prayer: '#3F5E8D',
      scripture: '#5B2A8C',
      task: '#A92371',
      exercise: '#D04395',
      other: '#8F8F8F',
    },
  },
  {
    // River-brown is four now rather than three — one of the six canopy
    // greens (the old date, `#7CB86A`) was recoloured into a fresh brown
    // (`#A87532`, hue 34°) rather than reused from elsewhere, filling the
    // gap between travel's 29° and meal's 40° so all four still read as one
    // evenly-stepped ladder rather than three plus an outlier — leaving a
    // five-step canopy green. Reassigned across the 14 non-grey ids in
    // ascending-hue order same as before: church/travel/meal/activity now
    // hold the four river-browns, date the olive-haze accent (bumped down a
    // slot by the new brown), contact through service the five-step green
    // family, prayer the teal accent, and scripture/task/exercise the
    // blackwater/morpho blues.
    id: 'amazon',
    label: 'Amazon',
    colors: {
      church: '#5C3319',
      travel: '#8F5A28',
      meal: '#A87532',
      activity: '#C99A3E',
      date: '#CCCFAA',
      contact: '#2C5B1E',
      work: '#4F9A3C',
      temple: '#A8D89C',
      school: '#1E3B17',
      service: '#357E28',
      prayer: '#479E90',
      scripture: '#1D4A54',
      task: '#2F6E85',
      exercise: '#3B5FC4',
      other: '#8F8F8F',
    },
  },
];

/**
 * Same five moods as EVENT_COLOR_SCHEMES, tuned separately for the eight
 * goal ids. Classic is trivially itself; every other scheme's set of eight
 * colours is assigned to ids by matching each colour to whichever goal's
 * Classic colour it's the closest overall match for (hue, saturation, and
 * lightness together, in Lab space — not hue alone, so a light muted colour
 * doesn't get matched to a dark vivid one just because they share a hue
 * family) — a single global best-fit assignment across all eight, so two
 * colours can't both claim the same closest goal. The colours themselves
 * are unchanged from each scheme's own tuning; only which id holds which
 * one moved. Because it's an optimum over the whole set rather than eight
 * independent nearest-matches, a given pair isn't always what you'd guess
 * from that pair alone — a colour can lose its individually-closest goal to
 * whichever other colour is a better fit there, if that leaves the
 * remaining colours better off overall.
 */
export const GOAL_COLOR_SCHEMES: GoalColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    colors: Object.fromEntries(DEFAULT_GOALS.map(g => [g.id, g.color])),
  },
  {
    id: 'marine',
    label: 'Marine',
    colors: {
      morning_prayer: '#B8961C',
      nightly_prayer: '#1E4A94',
      times_exercised: '#735420',
      personal_study: '#3288C7',
      total_dates: '#1C8C5D',
      service_hours: '#0F2D61',
      church_hours: '#28B87B',
      // Swapped in from THEME_COLOR_SCHEMES.marine's primary.
      temple_attendance: '#399BE0',
    },
  },
  {
    id: 'wildflower',
    label: 'Wildflower',
    colors: {
      morning_prayer: '#E0C65C',
      nightly_prayer: '#4B84D2',
      // Midpoint (average RGB) between the dark yellow this used to be
      // (`#736017`) and morning_prayer's gold (`#E0C65C`) — a lighter,
      // slightly less saturated yellow than either.
      times_exercised: '#AA933A',
      personal_study: '#83ABE2',
      total_dates: '#D6517E',
      service_hours: '#20793E',
      church_hours: '#9E2E53',
      temple_attendance: '#2E9E53',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: {
      morning_prayer: '#EFBE39',
      nightly_prayer: '#2D4E80',
      times_exercised: '#D15D1A',
      personal_study: '#5B2A8C',
      total_dates: '#E62B19',
      service_hours: '#193257',
      church_hours: '#952318',
      temple_attendance: '#557FBE',
    },
  },
  {
    // These eight colours started as a direct lift out of
    // EVENT_COLOR_SCHEMES.amazon — two blues (scripture, exercise), two
    // light greens (temple, work), two dark greens (school, contact), and
    // two browns (church, travel), skipping the family's middle members
    // (task's blue, service's green, meal/activity's gold-leaning browns)
    // and the teal/olive-haze accents and grey `other` entirely, since none
    // of those are clearly one of the four requested groups — but every hue
    // has since been pushed roughly +12% saturation/+15% value from that
    // baseline (capped at 92% value), since the direct lift read flat and
    // muddy at goal-card size the same way every other scheme's event
    // colours would if used unmodified (see the top-of-file note on why
    // goal cards get their own tuning). Assigned to ids by the same
    // global-optimal, full-color-distance match to Classic's own colours
    // used for the other schemes (run against the original un-brightened
    // values, before this bump) — so a couple of pairs (times_exercised
    // landing on a green instead of one of the two browns, in particular)
    // aren't the single closest match for that one goal alone, only the
    // best fit once every other goal's match is accounted for too.
    id: 'amazon',
    label: 'Amazon',
    colors: {
      // Nudged a couple degrees off Sunset's own morning_prayer/
      // nightly_prayer (`#EFBE39`/`#2D4E80`) rather than copied exactly, so
      // the two schemes' prayer pair read as the same colour at a glance
      // without one scheme literally duplicating the other's hex values.
      morning_prayer: '#E8C03C',
      nightly_prayer: '#2D4A7A',
      times_exercised: '#33811B',
      personal_study: '#28611A',
      total_dates: '#B5671D',
      service_hours: '#1C697A',
      church_hours: '#823F14',
      temple_attendance: '#479E90',
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

/**
 * The five dots every scheme's chip shows on the Event Types and Goals
 * onboarding pages — hand-picked from EVENT_COLOR_SCHEMES rather than
 * computed (the old approach picked whichever colours landed closest to
 * five target hues, which could land on an odd or unrepresentative pick),
 * and shared by both chip renderers so "Marine" shows the same five dots on
 * both pages instead of two different algorithmic samples of two different
 * colour sets. Picked to read as that scheme's identity at a glance: the
 * families it's built from, not an evenly-spaced rainbow sample.
 */
export const SCHEME_PREVIEW_DOTS: Record<string, string[]> = {
  classic: ['#E05C6B', '#E8980E', '#1E8449', '#2979FF', '#9B59B6'],
  marine: ['#A97723', '#179660', '#55ABE7', '#124CAF', '#082C68'],
  sunset: ['#D83F31', '#DD7A40', '#3F5E8D', '#5B2A8C', '#D04395'],
  amazon: ['#5C3319', '#4F9A3C', '#A8D89C', '#479E90', '#3B5FC4'],
  wildflower: ['#E0C468', '#5FA37E', '#93B8E0', '#B8688A', '#D98CA3'],
};
