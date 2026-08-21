import {
  DEFAULT_THEME_COLOR,
  DEFAULT_SECONDARY_COLOR_LIGHT, DEFAULT_SECONDARY_COLOR_DARK,
  DEFAULT_TERTIARY_COLOR_LIGHT, DEFAULT_TERTIARY_COLOR_DARK,
  DEFAULT_STATUS_COMPLETED_LIGHT, DEFAULT_STATUS_COMPLETED_DARK,
  DEFAULT_STATUS_FAILED_LIGHT, DEFAULT_STATUS_FAILED_DARK,
  DEFAULT_STATUS_PENDING_LIGHT, DEFAULT_STATUS_PENDING_DARK,
} from './colors';

/**
 * Ready-made palettes for the onboarding colours page — the same "pick a
 * look instead of hand-tuning every swatch" idea as EVENT_COLOR_SCHEMES /
 * GOAL_COLOR_SCHEMES in colorSchemes.ts, and deliberately the same five
 * names (Classic, Marine, Sunset, Amazon, Wildflower) so a person who
 * picks "Sunset" here and "Sunset" on the Event Types page is choosing one
 * consistent identity, not two unrelated things that happen to share a
 * label. Split into a theme scheme (primary/secondary/tertiary) and a
 * status scheme (completed/failed/pending) because they drive unrelated
 * things a person may want to mix independently.
 */
export interface ThemeColorScheme {
  id: string;
  label: string;
  themeColor: string;
  secondaryColorLight: string;
  secondaryColorDark: string;
  tertiaryColorLight: string;
  tertiaryColorDark: string;
}

export const THEME_COLOR_SCHEMES: ThemeColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    themeColor: DEFAULT_THEME_COLOR,
    secondaryColorLight: DEFAULT_SECONDARY_COLOR_LIGHT,
    secondaryColorDark: DEFAULT_SECONDARY_COLOR_DARK,
    tertiaryColorLight: DEFAULT_TERTIARY_COLOR_LIGHT,
    tertiaryColorDark: DEFAULT_TERTIARY_COLOR_DARK,
  },
  {
    // Light blue primary (swapped in from GOAL_COLOR_SCHEMES.marine's
    // temple_attendance), aquamarine secondary, navy blue tertiary. Tertiary
    // lifts to a pale light blue in dark mode, the way Classic's navy lifts
    // to a pale blue; secondary lifts the same way, a deeper aquamarine in
    // light mode reading as pale aquamarine once the background goes dark.
    id: 'marine',
    label: 'Marine',
    themeColor: '#2F729E',
    secondaryColorLight: '#1FA98C',
    secondaryColorDark: '#4DDBB5',
    tertiaryColorLight: '#1C3154',
    tertiaryColorDark: '#AFCBDE',
  },
  {
    // Pink/green/blue, the same muted-garden mix as the Wildflower scheme.
    id: 'wildflower',
    label: 'Wildflower',
    themeColor: '#B8688A',
    secondaryColorLight: '#7FB88F',
    secondaryColorDark: '#7FB88F',
    tertiaryColorLight: '#3F5C82',
    tertiaryColorDark: '#93B8E0',
  },
  {
    // Burnt orange primary, magenta secondary, navy tertiary — primary and
    // tertiary still the burnt-orange/navy families the event scheme's
    // Sunset uses (colorSchemes.ts), though not tied to any specific id
    // there since that scheme's ids are ordered by hue rather than fixed to
    // a family; secondary is the event scheme's own exercise colour, its
    // magenta family. Lifts to a lighter navy in dark mode, the way
    // Classic's navy lifts to a pale blue.
    id: 'sunset',
    label: 'Sunset',
    themeColor: '#B8571E',
    secondaryColorLight: '#D04395',
    secondaryColorDark: '#D04395',
    tertiaryColorLight: '#263D5E',
    tertiaryColorDark: '#3F5E8D',
  },
  {
    // River-brown/canopy-green only, same rule as the Amazon event/goal
    // scheme. Primary is a darker forest-floor green, tertiary a more
    // saturated canopy green in light mode — lifting to a brighter canopy
    // green in dark mode the way Classic's navy lifts to a pale blue (the
    // old tertiary-dark value sat too close to this lighter tertiary-light
    // to still read as a lift, so it's a fresh shade rather than the
    // pre-swap one). Secondary is Amazon's own nightly_prayer goal colour
    // (GOAL_COLOR_SCHEMES, not defaultGoals' default violet), shared between
    // light and dark the way Classic/Sunset/Wildflower's secondary is.
    id: 'amazon',
    label: 'Amazon',
    themeColor: '#1F4A22',
    secondaryColorLight: '#D4A62E',
    secondaryColorDark: '#D4A62E',
    tertiaryColorLight: '#3C7A3F',
    tertiaryColorDark: '#5FAE63',
  },
];

export interface StatusColorScheme {
  id: string;
  label: string;
  statusCompletedColorLight: string;
  statusCompletedColorDark: string;
  statusFailedColorLight: string;
  statusFailedColorDark: string;
  statusPendingColorLight: string;
  statusPendingColorDark: string;
}

/**
 * Unlike THEME_COLOR_SCHEMES and the event/goal schemes, status colours
 * don't get to wander into a scheme's own hue family — completed reads as
 * green, failed as red, pending as yellow everywhere in the app (the
 * checkmark, the ban glyph, the alert triangle), so a scheme that put
 * failed on brown or completed on blue was fighting that meaning rather
 * than restyling it. Every scheme here is a green/red/yellow trio built as
 * a small nudge off Classic's own hue/saturation/lightness — a few degrees
 * of hue and a bit of saturation, nothing that reads as a different colour
 * — so each still feels like "the same status colour, this scheme's take
 * on it" rather than an unrelated hue that happens to occupy the same
 * role. Marine and Amazon don't bother with their own nudge and just reuse
 * Sunset's trio outright — with the meaning locked, a second or third
 * near-identical nudge added nothing a person picking by scheme would
 * actually see differently.
 */
export const STATUS_COLOR_SCHEMES: StatusColorScheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    statusCompletedColorLight: DEFAULT_STATUS_COMPLETED_LIGHT,
    statusCompletedColorDark: DEFAULT_STATUS_COMPLETED_DARK,
    statusFailedColorLight: DEFAULT_STATUS_FAILED_LIGHT,
    statusFailedColorDark: DEFAULT_STATUS_FAILED_DARK,
    statusPendingColorLight: DEFAULT_STATUS_PENDING_LIGHT,
    statusPendingColorDark: DEFAULT_STATUS_PENDING_DARK,
  },
  {
    // Same trio as Sunset — status colours are locked to green/red/amber
    // meaning regardless of scheme, so there's no separate "marine-flavoured"
    // nudge to make here; it just reuses Sunset's hex codes outright.
    id: 'marine',
    label: 'Marine',
    statusCompletedColorLight: '#157524',
    statusCompletedColorDark: '#37B348',
    statusFailedColorLight: '#B63D2A',
    statusFailedColorDark: '#E77766',
    statusPendingColorLight: '#E9A508',
    statusPendingColorDark: '#FAC032',
  },
  {
    // Classic's green nudged toward a muted sage, red nudged a shade
    // warmer/pinker, amber nudged toward a softer gold.
    id: 'wildflower',
    label: 'Wildflower',
    statusCompletedColorLight: '#267D3A',
    statusCompletedColorDark: '#54AF67',
    statusFailedColorLight: '#B03F5A',
    statusFailedColorDark: '#DD7F95',
    statusPendingColorLight: '#E4B021',
    statusPendingColorDark: '#ECC554',
  },
  {
    // Classic's green nudged toward olive/yellow-green so it still sits
    // beside the horizon's fiery reds and golds, red nudged a touch more
    // orange, amber nudged a touch richer/deeper gold.
    id: 'sunset',
    label: 'Sunset',
    statusCompletedColorLight: '#157524',
    statusCompletedColorDark: '#37B348',
    statusFailedColorLight: '#B63D2A',
    statusFailedColorDark: '#E77766',
    statusPendingColorLight: '#E9A508',
    statusPendingColorDark: '#FAC032',
  },
  {
    // Same trio as Sunset — see the note on Marine above.
    id: 'amazon',
    label: 'Amazon',
    statusCompletedColorLight: '#157524',
    statusCompletedColorDark: '#37B348',
    statusFailedColorLight: '#B63D2A',
    statusFailedColorDark: '#E77766',
    statusPendingColorLight: '#E9A508',
    statusPendingColorDark: '#FAC032',
  },
];

/** Whether `draft` matches a known theme scheme exactly, for seeding the picker's selected chip. */
export function matchThemeColorScheme(draft: {
  themeColor: string;
  secondaryColorLight: string;
  secondaryColorDark: string;
  tertiaryColorLight: string;
  tertiaryColorDark: string;
}): string | null {
  const match = THEME_COLOR_SCHEMES.find(s =>
    s.themeColor === draft.themeColor &&
    s.secondaryColorLight === draft.secondaryColorLight &&
    s.secondaryColorDark === draft.secondaryColorDark &&
    s.tertiaryColorLight === draft.tertiaryColorLight &&
    s.tertiaryColorDark === draft.tertiaryColorDark,
  );
  return match?.id ?? null;
}

/** Whether `draft` matches a known status scheme exactly, for seeding the picker's selected chip. */
export function matchStatusColorScheme(draft: {
  statusCompletedColorLight: string;
  statusCompletedColorDark: string;
  statusFailedColorLight: string;
  statusFailedColorDark: string;
  statusPendingColorLight: string;
  statusPendingColorDark: string;
}): string | null {
  const match = STATUS_COLOR_SCHEMES.find(s =>
    s.statusCompletedColorLight === draft.statusCompletedColorLight &&
    s.statusCompletedColorDark === draft.statusCompletedColorDark &&
    s.statusFailedColorLight === draft.statusFailedColorLight &&
    s.statusFailedColorDark === draft.statusFailedColorDark &&
    s.statusPendingColorLight === draft.statusPendingColorLight &&
    s.statusPendingColorDark === draft.statusPendingColorDark,
  );
  return match?.id ?? null;
}
