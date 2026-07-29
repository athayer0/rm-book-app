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

// The stored status stays plural for consistency across the app, but reads
// more naturally singular when picking a status for one specific person.
const STATUS_SINGULAR_DISPLAY: Record<string, string> = {
  'Recent Converts': 'Recent Convert',
  'Potential Dates': 'Potential Date',
  'Members': 'Member',
  'Mission Friends': 'Mission Friend',
  'Friends': 'Friend',
};

export function statusDisplayName(status: string): string {
  return STATUS_SINGULAR_DISPLAY[status] ?? status;
}
