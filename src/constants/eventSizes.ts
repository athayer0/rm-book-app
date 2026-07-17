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
  xl: { label: 'Extra Large', slotHeight: 70, fontSize: 14 },
};

export const EVENT_SIZE_OPTIONS = Object.keys(EventSizes) as EventSize[];

// 50px per half-hour is the density the calendar has always used.
export const DEFAULT_EVENT_SIZE: EventSize = 'lg';

export const DEFAULT_SLOT_HEIGHT = EventSizes[DEFAULT_EVENT_SIZE].slotHeight;

// Settings persist to AsyncStorage, so a stored value may predate this list.
export function resolveEventSize(size: EventSize | undefined): EventSize {
  return size && EventSizes[size] ? size : DEFAULT_EVENT_SIZE;
}
