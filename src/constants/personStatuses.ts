import type { TFunction } from 'i18next';

export type StatusShape = 'circle' | 'dot' | 'star' | 'diamond';

export interface StatusConfig {
  color: string;
  icon: string;
  shape: StatusShape;
  isRing?: boolean;
  isDiamond?: boolean;
  themed?: boolean;
}

export const PERSON_STATUSES: Record<string, StatusConfig> = {
  'Eternal Companion': { color: '#5DADE2', icon: 'ellipse-outline', shape: 'circle', isRing: true },
  'Recent Converts':   { color: '#5DADE2', icon: 'star',          shape: 'star'    },
  'Family':            { color: '#1A3A6B', icon: 'star',          shape: 'star'    },
  'Members':           { color: '#1A3A6B', icon: 'ellipse',       shape: 'dot'     },
  'Mission Leaders':   { color: '#1A3A6B', icon: 'ellipse-outline', shape: 'circle', isRing: true },
  'Mission Friends':   { color: '#1A3A6B', icon: 'rhombus',       shape: 'diamond', isDiamond: true },
  'Friends':           { color: '#27AE60', icon: 'rhombus',       shape: 'diamond', isDiamond: true },
  'Relationship':      { color: '#27AE60', icon: 'star',          shape: 'star'    },
  '1+ Dates':          { color: '#27AE60', icon: 'ellipse',       shape: 'circle'  },
  'Potential Dates':   { color: '#F5C518', icon: 'ellipse',      shape: 'circle'  },
  'Not Interested':    { color: '#95A5A6', icon: 'ellipse',       shape: 'dot'     },
  'Do Not Contact':    { color: '#E74C3C', icon: 'ellipse',       shape: 'dot'     },
  'Other':             { color: '#000000', icon: 'ellipse',       shape: 'dot',     themed: true },
};

export const STATUS_OPTIONS = Object.keys(PERSON_STATUSES);

/** The headings people are listed under, in display order. */
export const STATUS_GROUPS: { name: string; statuses: string[] }[] = [
  { name: 'Church', statuses: ['Recent Converts', 'Members', 'Mission Leaders'] },
  { name: 'Friends & Family', statuses: ['Eternal Companion', 'Family', 'Mission Friends', 'Friends'] },
  { name: 'Dating', statuses: ['Relationship', '1+ Dates', 'Potential Dates', 'Not Interested', 'Do Not Contact'] },
];

/** Sort order for a status: the order PERSON_STATUSES declares it in. */
export function statusRank(status: string): number {
  const index = STATUS_OPTIONS.indexOf(status);
  return index === -1 ? STATUS_OPTIONS.length : index;
}

/**
 * People under their group's heading, groups in declared order.
 *
 * Shared by the People tab and the event people picker so the two cannot drift
 * on what belongs under which heading. Anyone whose status is in no group trails
 * behind under a null label — a heading of their own would be a lie, since what
 * they have in common is only that nothing claimed them.
 */
export function groupByStatus<T extends { status: string }>(
  list: T[],
): { label: string | null; people: T[] }[] {
  const groups = STATUS_GROUPS
    .map(group => ({
      label: group.name as string | null,
      people: list.filter(p => group.statuses.includes(p.status)),
    }))
    .filter(group => group.people.length > 0);

  const claimed = new Set(STATUS_GROUPS.flatMap(g => g.statuses));
  const ungrouped = list.filter(p => !claimed.has(p.status));
  return ungrouped.length > 0 ? [...groups, { label: null, people: ungrouped }] : groups;
}

// The stored status stays plural for consistency across the app, but reads
// more naturally singular when picking a status for one specific person.
const STATUS_SINGULAR_DISPLAY: Record<string, string> = {
  'Recent Converts': 'Recent Convert',
  'Potential Dates': 'Potential Date',
  'Members': 'Member',
  'Mission Leaders': 'Mission Leader',
  'Mission Friends': 'Mission Friend',
  'Friends': 'Friend',
};

export function statusDisplayName(status: string, t: TFunction): string {
  const singular = STATUS_SINGULAR_DISPLAY[status];
  return singular
    ? t(`personStatusesSingular.${status}`, { defaultValue: singular })
    : t(`personStatuses.${status}`, { defaultValue: status });
}

/** The heading a STATUS_GROUPS entry displays under — falls back to the raw name for anything not in PERSON_STATUSES' fixed set. */
export function statusGroupLabel(groupName: string, t: TFunction): string {
  return t(`personStatusGroups.${groupName}`, { defaultValue: groupName });
}

/**
 * The statuses a reported date moves someone out of.
 *
 * Only the rung before a first date promotes. Someone already at '1+ Dates' or in
 * a 'Relationship' has nowhere to go, and 'Not Interested' / 'Do Not Contact' are
 * deliberate answers — a logged date must not quietly overturn one.
 *
 * The singular spelling is only ever a display form (STATUS_SINGULAR_DISPLAY), but
 * recognising it here costs nothing and means the promotion can't silently miss
 * someone whose stored status arrived in that shape.
 */
const PROMOTED_BY_DATE = new Set(['Potential Dates', 'Potential Date']);

/**
 * Where a person lands once a date with them is reported completed, or null when
 * the date says nothing new about where they already stand.
 */
export function statusAfterCompletedDate(status: string): string | null {
  return PROMOTED_BY_DATE.has(status) ? '1+ Dates' : null;
}
