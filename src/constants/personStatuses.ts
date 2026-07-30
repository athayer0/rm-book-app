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
  { name: 'Dating', statuses: ['Relationship', '1+ Dates', 'Potential Dates', 'Not Interested', 'Do Not Contact'] },
  { name: 'Friends & Family', statuses: ['Eternal Companion', 'Family', 'Mission Friends', 'Friends'] },
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

export function statusDisplayName(status: string): string {
  return STATUS_SINGULAR_DISPLAY[status] ?? status;
}
