import { EventColors, EventTypeLabels, EventTypeIcons } from './colors';

export interface EventTypeDefinition {
  id: string;
  label: string;
  icon: string;
  iconFamily?: string;
  visible: boolean;
  builtIn: boolean;
  /** Custom types only: the custom goal this type's completions contribute to. */
  goalId?: string;
  /** Custom types only: +1 per completion, or the event's duration in hours. Defaults to 'count'. */
  goalMode?: 'count' | 'hours';
}

/**
 * Built from the existing EventColors/EventTypeLabels/EventTypeIcons tables, so
 * display order matches the spectrum order already established there — see the
 * comment on EventColors in colors.ts.
 */
export const DEFAULT_EVENT_TYPES: EventTypeDefinition[] = Object.keys(EventColors).map(id => ({
  id,
  label: EventTypeLabels[id],
  icon: EventTypeIcons[id]?.icon ?? 'ellipse',
  iconFamily: EventTypeIcons[id]?.iconFamily,
  visible: true,
  builtIn: true,
}));
