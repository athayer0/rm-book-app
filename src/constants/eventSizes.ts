// Calendar density presets. `slotHeight` is the pixel height of one 30-minute
// slot — the unit every piece of grid geometry is derived from.
export type EventSize = 'sm' | 'md' | 'lg' | 'xl';

export interface EventSizeConfig {
  label: string;
  slotHeight: number;
  fontSize: number;
}

export const EventSizes: Record<EventSize, EventSizeConfig> = {
  sm: { label: 'Small',       slotHeight: 30, fontSize: 11 },
  md: { label: 'Medium',      slotHeight: 40, fontSize: 12 },
  lg: { label: 'Large',       slotHeight: 50, fontSize: 13 },
  xl: { label: 'Extra Large', slotHeight: 60, fontSize: 14 },
};

export const EVENT_SIZE_OPTIONS = Object.keys(EventSizes) as EventSize[];

// How a size reads against Medium, e.g. for "Large (125%)" in settings.
export function eventSizePercent(size: EventSize): number {
  return Math.round((EventSizes[size].slotHeight / EventSizes.md.slotHeight) * 100);
}

export const DEFAULT_EVENT_SIZE: EventSize = 'md';

export const DEFAULT_SLOT_HEIGHT = EventSizes[DEFAULT_EVENT_SIZE].slotHeight;

// Width of the calendar's left-hand hour-label column. Shared by TimeGrid
// (which lays the column out) and EventBlock (which derives event-block drag
// width from screen width minus this) — a value only one of them knew about
// would let the two silently disagree.
export const TIME_COL_WIDTH = 64;

// Settings persist to AsyncStorage, so a stored value may predate this list.
export function resolveEventSize(size: EventSize | undefined): EventSize {
  return size && EventSizes[size] ? size : DEFAULT_EVENT_SIZE;
}
