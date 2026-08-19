import { EventColors } from './colors';
import { DEFAULT_GOALS } from './defaultGoals';
import { hexToHsv } from '../utils/colorUtils';

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
 * Earthy stays inside one hue family — brown/green/tan only — telling its
 * fifteen types apart by lightness and saturation rather than hue. Ember,
 * Great Wave, and Wildflower are each drawn from a real reference instead of
 * an abstract hue rule: Ember is Munch's fiery blood-orange sky against the
 * fjord's blue-black, Great Wave is Hokusai's Prussian-blue swell and pale
 * sky, Wildflower is a muted pink/green/blue/yellow garden mix. Ember and
 * Great Wave mix warm and cool on purpose — that mix is what makes them read
 * as the thing they're named after.
 */
export const EVENT_COLOR_SCHEMES: EventColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    colors: { ...EventColors },
  },
  {
    id: 'great_wave',
    label: 'Great Wave',
    colors: {
      church: '#1B3A6B',
      travel: '#0A2A4A',
      meal: '#6B4A2B',
      activity: '#3A6EA5',
      date: '#D9C48F',
      contact: '#8FB6C7',
      work: '#2E5C7A',
      temple: '#0C3B5E',
      school: '#5E8CA0',
      service: '#16283A',
      prayer: '#A9C6D1',
      scripture: '#4A7690',
      task: '#4A3524',
      exercise: '#23557A',
      other: '#B8C4C2',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    colors: {
      church: '#7A1F0D',
      travel: '#D1401A',
      meal: '#E8631D',
      activity: '#F2A93C',
      date: '#F7D046',
      contact: '#C96A3E',
      work: '#8A6E3F',
      temple: '#1B3A4B',
      school: '#2E5266',
      service: '#14222B',
      prayer: '#4A6C6F',
      scripture: '#6E8B8C',
      task: '#3E3226',
      exercise: '#B23A1E',
      other: '#5C5347',
    },
  },
  {
    id: 'earthy',
    label: 'Earthy',
    colors: {
      church: '#8B5E3C',
      travel: '#5C4033',
      meal: '#A67C52',
      activity: '#4F8A34',
      date: '#BFA76F',
      contact: '#5FA34A',
      work: '#2F6B25',
      temple: '#4C7A52',
      school: '#8A8478',
      service: '#2A4A2E',
      prayer: '#9C8158',
      scripture: '#5A4632',
      task: '#6E5849',
      exercise: '#4A7A28',
      other: '#8A8578',
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
    // Reassigned from the same fifteen Great Wave hues used for event types
    // rather than sampled fresh — the painting itself is mostly blue, so
    // spreading its two boat-wood browns, its sand tan, and its pale foam
    // grey across four of the eight goals (instead of leaving six of eight
    // on some shade of blue) is what keeps the goal grid from reading as one
    // undifferentiated wash. church_hours started on that same pale foam
    // grey too, which read as barely-there rather than as a colour, so it
    // was moved to a mid-tone wave blue with enough saturation to actually
    // register.
    id: 'great_wave',
    label: 'Great Wave',
    colors: {
      morning_prayer: '#D9C48F',
      nightly_prayer: '#0A2A4A',
      times_exercised: '#4A3524',
      personal_study: '#8FB6C7',
      total_dates: '#6B4A2B',
      service_hours: '#16283A',
      church_hours: '#3A6EA5',
      temple_attendance: '#0C3B5E',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    colors: {
      morning_prayer: '#F7D046',
      nightly_prayer: '#14222B',
      times_exercised: '#B23A1E',
      personal_study: '#6E8B8C',
      total_dates: '#D1401A',
      service_hours: '#1B3A4B',
      church_hours: '#7A1F0D',
      temple_attendance: '#2E5266',
    },
  },
  {
    id: 'earthy',
    label: 'Earthy',
    colors: {
      morning_prayer: '#BFA76F',
      nightly_prayer: '#5A4632',
      times_exercised: '#4A7A28',
      personal_study: '#6E5849',
      total_dates: '#8B5E3C',
      service_hours: '#2A4A2E',
      church_hours: '#6B4226',
      temple_attendance: '#4C7A52',
    },
  },
  {
    id: 'wildflower',
    label: 'Wildflower',
    colors: {
      morning_prayer: '#ECD488',
      nightly_prayer: '#3F5C82',
      times_exercised: '#5FA37E',
      personal_study: '#6B93C2',
      total_dates: '#D98CA3',
      service_hours: '#4F7A63',
      church_hours: '#B8688A',
      temple_attendance: '#93B8E0',
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

/** Circular hue distance in degrees (0-180) — 350 and 10 are 20 apart, not 340. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Red, orange-or-yellow, green, blue, purple, in that order — the bands the
 * preview dots are chosen to land on, so a chip reads as a little rainbow
 * left to right regardless of which id happens to hold which hue in a given
 * scheme.
 */
const PREVIEW_TARGET_HUES = [0, 45, 130, 215, 280];

/**
 * Picks one colour per target hue: whichever of the scheme's colours sits
 * closest to it, with a small bonus for higher saturation so a vivid swatch
 * wins over a muted one at roughly the same hue (this is why Classic's chip
 * lands on the true red/yellow/green/blue/purple rather than on whichever
 * five ids happened to fall at evenly-spaced positions in the table). A
 * colour is never picked twice.
 *
 * Falls back to even sampling by position once a scheme has fewer distinct
 * colours than target hues to fill — a custom scheme could in principle be
 * that short, even though no shipped one is.
 */
export function schemePreviewColors(colors: Record<string, string>, count = 5): string[] {
  const values = Object.values(colors);
  if (values.length === 0) return [];

  const targets = PREVIEW_TARGET_HUES.slice(0, count);
  if (values.length < targets.length) {
    if (values.length <= count) return values;
    const step = (values.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => values[Math.round(i * step)]);
  }

  const hsv = values.map(hexToHsv);
  const used = new Set<number>();
  const picks: string[] = [];
  for (const target of targets) {
    let bestIndex = -1;
    let bestScore = Infinity;
    hsv.forEach(({ h, s }, i) => {
      if (used.has(i)) return;
      const score = hueDistance(h, target) - s * 12;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    if (bestIndex !== -1) {
      used.add(bestIndex);
      picks.push(values[bestIndex]);
    }
  }
  return picks;
}
