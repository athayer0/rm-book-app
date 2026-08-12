import { format, parseISO, addDays, addWeeks, addMonths } from 'date-fns';
import { DEFAULT_SLOT_HEIGHT, EventSizes } from '../constants/eventSizes';
import { EventColors, EventTypeConfig } from '../constants/colors';

export type RecurringRule = 'daily' | 'weekly' | 'monthly';

// How far a new series runs unless the user picks an end date themselves. Each rule
// counts in its own unit rather than a shared one.
const DEFAULT_SPAN: Record<RecurringRule, (start: Date) => Date> = {
  daily: start => addDays(start, 60),
  weekly: start => addWeeks(start, 12),
  monthly: start => addMonths(start, 6),
};

export function defaultRecurrenceEnd(startDate: string, rule: RecurringRule): string {
  return format(DEFAULT_SPAN[rule](parseISO(startDate)), 'yyyy-MM-dd');
}

export type EventStatus = 'completed' | 'failed' | 'pending';

// Types that carry a reported status. Most of them feed a goal, but `contact`
// deliberately does not: a contact is worth reporting on without being worth
// counting, and getGoalContribution is free to return null for it.
export const TRACKABLE_TYPES = new Set([
  'prayer', 'temple', 'church', 'scripture', 'exercise', 'service', 'date', 'contact',
]);

export interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  color: string;
  date: string;
  startTime: string;
  /**
   * Equal to `startTime` means the event has no duration — either because its
   * type can't have one (checkbox types) or because none was given (an
   * `optionalEnd` type such as contact). See hasEndTime().
   */
  endTime: string;
  notes?: string;
  /** Ids of the people this event involves, in the order they were added. */
  people?: string[];
  /** Contact events only: which channel the contact was made through. */
  contactMethod?: string;
  recurring: boolean;
  recurringRule?: RecurringRule;
  /** Last date the series runs, inclusive. Undefined means it never ends. */
  recurringUntil?: string;
  /** Occurrences deleted individually, leaving the rest of the series intact. */
  excludedDates?: string[];
  /** For weekly series: weekdays (0=Sun … 6=Sat) it repeats on. Falls back to the start
   *  date's weekday when unset. */
  recurringDays?: number[];
  backup?: boolean;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getEventsForDate(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  const results: CalendarEvent[] = [];

  events.forEach(event => {
    if (!event.recurring) {
      if (event.date === dateStr) results.push(event);
      return;
    }

    const startDate = parseISO(event.date);
    const targetDate = parseISO(dateStr);

    if (targetDate < startDate) return;
    // ISO dates compare correctly as strings.
    if (event.recurringUntil && dateStr > event.recurringUntil) return;
    if (event.excludedDates?.includes(dateStr)) return;

    switch (event.recurringRule) {
      case 'daily': {
        results.push({ ...event, date: dateStr });
        break;
      }
      case 'weekly': {
        const targetDay = targetDate.getDay();
        const days = event.recurringDays && event.recurringDays.length > 0
          ? event.recurringDays
          : [startDate.getDay()];
        if (days.includes(targetDay)) {
          results.push({ ...event, date: dateStr });
        }
        break;
      }
      case 'monthly': {
        if (startDate.getDate() === targetDate.getDate()) {
          results.push({ ...event, date: dateStr });
        }
        break;
      }
    }
  });

  return results.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// Parse a "9:30 AM" style string into 24-hour { hour, minute }.
function parseTime(timeStr: string): { hour: number; minute: number } {
  const [time, ampm] = timeStr.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

function timeToMinutes(timeStr: string): number {
  const { hour, minute } = parseTime(timeStr);
  return hour * 60 + minute;
}

export function eventTopOffset(startTime: string, gridStartHour: number = 6, slotHeight: number = DEFAULT_SLOT_HEIGHT): number {
  const { hour, minute } = parseTime(startTime);
  const totalMinutes = (hour - gridStartHour) * 60 + minute;
  return (totalMinutes / 30) * slotHeight;
}

function eventHeight(startTime: string, endTime: string, slotHeight: number = DEFAULT_SLOT_HEIGHT): number {
  let end = timeToMinutes(endTime);
  const start = timeToMinutes(startTime);
  if (end <= start) end += 24 * 60; // midnight end-of-day wrap ("12:00 AM" = 0 → 1440)
  const duration = Math.max(end - start, 15);
  return (duration / 30) * slotHeight;
}

// The rendered height of a block, minus the 1px gap that separates neighbours.
// Floored at COMPACT_EVENT_HEIGHT: a short event is drawn no smaller than a
// contact or a task, which is the least a block can be and still be read and
// tapped. At the larger densities a 15-minute block already clears that, so the
// floor only binds on the smaller ones.
function eventBlockHeight(startTime: string, endTime: string, slotHeight: number = DEFAULT_SLOT_HEIGHT): number {
  return Math.max(eventHeight(startTime, endTime, slotHeight) - 1, COMPACT_EVENT_HEIGHT);
}

// The smallest a block ever gets: what an event with no duration renders at — a
// contact logged without an end time, or a task — whatever the calendar's size
// setting, and the floor under every other block too. Exported because
// EventBlock derives its padding from it: the padding that centres a title inside
// this height is the padding every block gets.
export const COMPACT_EVENT_HEIGHT = EventSizes.sm.slotHeight - 1;

// The size a task's checkbox draws at on a calendar block — a step down from
// the badge slot it sits in, since a plain outline box reads bigger than a
// glyph at the same size. The one place StatusCheckbox is drawn at its
// "native" size; every other call site's outline thickness scales relative
// to this, so the outline never reads a different weight between screens.
export const CALENDAR_CHECKBOX_SIZE = Math.round(COMPACT_EVENT_HEIGHT * 0.75);

export function isCheckboxType(type: string): boolean {
  return EventTypeConfig[type]?.hasCheckbox ?? false;
}

/** Whether this type may be saved without an end time rather than taking a default duration. */
export function hasOptionalEnd(type: string): boolean {
  return EventTypeConfig[type]?.optionalEnd ?? false;
}

/** For a type this build no longer ships — a stored event can outlive its own type. */
const DEFAULT_EVENT_COLOR = '#00B5C8';
const FALLBACK_MINUTES = 30;

/**
 * What a type actually looks like and lasts, once the user's overrides are
 * applied over the stock table. Both take the override map alone rather than the
 * whole settings object, so `utils` keeps its one-way dependency on `constants`
 * — three screens and the event editor need these answers and had each grown
 * their own copy of the fallback chain.
 *
 * The reset flows depend on the fallback being *absence* of a key: deleting an
 * override is how a type goes back to stock, so writing the stock value in would
 * leave it looking customised forever.
 */
export function eventTypeColor(type: string, overrides: Record<string, string>): string {
  return overrides[type] ?? EventColors[type] ?? DEFAULT_EVENT_COLOR;
}

/**
 * null means the type has no default duration to offer at all — either it can
 * never have one (a checkbox type) or it starts without one and asks (an
 * optional-end type). Distinct from a duration of zero.
 */
export function eventTypeDefaultMinutes(
  type: string,
  overrides: Record<string, number>,
): number | null {
  if (isCheckboxType(type) || hasOptionalEnd(type)) return null;
  return overrides[type] ?? EventTypeConfig[type]?.defaultMinutes ?? FALLBACK_MINUTES;
}

/**
 * Whether the event actually spans time.
 *
 * One rule for both ways an event can lack a duration: a checkbox type, which
 * never has one, and an `optionalEnd` type left without one. Both are stored the
 * same way — end equal to start — so both answer here rather than each caller
 * asking about the type.
 *
 * Only exact equality counts. An event running to "12:00 AM" has an end that
 * sorts *before* its start, and that midnight wrap is a real duration.
 */
export function hasEndTime(event: CalendarEvent): boolean {
  return event.endTime !== event.startTime;
}

// The pixel height a block should render at. Anything with no duration gets the
// same compact block, whether that's a checkbox type or a contact logged without
// an end time — the alternative is eventHeight() reading end <= start as a
// midnight wrap and drawing a 24-hour block.
export function renderedEventHeight(event: CalendarEvent, slotHeight: number = DEFAULT_SLOT_HEIGHT): number {
  if (!hasEndTime(event)) return COMPACT_EVENT_HEIGHT;
  return eventBlockHeight(event.startTime, event.endTime, slotHeight);
}

/**
 * An event's length in whole hours, floored at one.
 *
 * The rounding is what the hour-counting goals report, so church and service
 * share it rather than each doing its own arithmetic: a 40-minute block is worth
 * an hour to both, and neither can end up worth zero.
 */
function durationHours(event: CalendarEvent): number {
  const mins = Math.max(0, timeToMinutes(event.endTime) - timeToMinutes(event.startTime));
  return Math.max(1, Math.round(mins / 60));
}

export function getGoalContribution(event: CalendarEvent): { goalId: string; delta: number } | null {
  switch (event.type) {
    // Which of the two prayer goals a prayer counts toward is decided by when it
    // starts, not how long it ran: a prayer is one prayer whatever its duration,
    // and 2pm is the line between the morning one and the nightly one.
    case 'prayer': {
      const { hour } = parseTime(event.startTime);
      return { goalId: hour < 14 ? 'morning_prayer' : 'nightly_prayer', delta: 1 };
    }
    case 'temple':
      return { goalId: 'temple_attendance', delta: 1 };
    case 'church':
      return { goalId: 'church_hours', delta: durationHours(event) };
    case 'service':
      return { goalId: 'service_hours', delta: durationHours(event) };
    case 'scripture':
      return { goalId: 'personal_study', delta: 1 };
    case 'exercise':
      return { goalId: 'times_exercised', delta: 1 };
    case 'date':
      return { goalId: 'total_dates', delta: 1 };
    // contact is trackable but counts toward nothing — see TRACKABLE_TYPES.
    default:
      return null;
  }
}

/**
 * Whether the reporting shortcut should account for this type.
 *
 * Derived from the two things that make an event reportable at all — feeding a
 * goal, or carrying a checkbox — rather than listed out, so adding either trait
 * to a type enrols it automatically. A hardcoded list would silently leave a new
 * type out of the unreported count, which reads as a counting bug rather than as
 * a missing entry.
 */
export function isReportableType(type: string): boolean {
  return TRACKABLE_TYPES.has(type) || isCheckboxType(type);
}

/**
 * How far back the unreported sweep looks.
 *
 * Bounded because a recurring series with no `recurringUntil` expands one
 * occurrence per day forever — an unbounded sweep would walk from the earliest
 * event to today and build a list thousands long.
 */
export const UNREPORTED_LOOKBACK_DAYS = 30;

/**
 * The status an occurrence actually has, recorded or not.
 *
 * The single definition of what the three states mean. An event whose start has
 * passed with nothing recorded is pending — it is waiting on an answer, which is
 * the same condition as one marked pending by hand, so both resolve here to the
 * same value. Callers that need to know whether something is outstanding ask this
 * rather than reassembling it from a type check, a clock check and a status check.
 *
 * Deliberately says nothing about how the state is drawn. A task renders a
 * checkbox rather than a badge, but it is still pending until it is ticked, and
 * letting that presentation choice reach back into the meaning is what previously
 * forced the unreported sweep to special-case checkbox types.
 *
 * Types that cannot be reported resolve to undefined even if a status is somehow
 * stored against them — there is no UI that can produce one, and a status on an
 * unreportable type has nothing to mean.
 */
export function resolveEventStatus(
  event: CalendarEvent,
  stored: EventStatus | undefined,
): EventStatus | undefined {
  if (event.backup) return undefined;
  if (!isReportableType(event.type)) return undefined;
  return stored ?? (hasEventStartPassed(event) ? 'pending' : undefined);
}

/**
 * Every occurrence in the lookback window still waiting on an answer, most recent
 * day first.
 *
 * One condition, because resolveEventStatus already owns the definition: pending
 * covers both the never-touched and the deliberately deferred, while completed and
 * failed are answers and drop out.
 *
 * Walks a day at a time because getEventsForDate is the only recurrence expander
 * — it answers "what falls on this date", so there is no bulk form to call.
 */
export function findUnreportedOccurrences(
  events: CalendarEvent[],
  statusOf: (eventId: string, dateStr: string) => EventStatus | undefined,
  today: Date = new Date(),
): CalendarEvent[] {
  const found: CalendarEvent[] = [];

  for (let back = 0; back <= UNREPORTED_LOOKBACK_DAYS; back++) {
    const dateStr = format(addDays(today, -back), 'yyyy-MM-dd');
    for (const occurrence of getEventsForDate(events, dateStr)) {
      // getEventsForDate stamps the occurrence's own date, so the clock check
      // inside resolveEventStatus reads this occurrence rather than the series'
      // first one.
      if (resolveEventStatus(occurrence, statusOf(occurrence.id, dateStr)) === 'pending') {
        found.push(occurrence);
      }
    }
  }

  return found;
}

/**
 * What a week's completed events contribute to each goal.
 *
 * This is the derived half of a week's total; the other half is a stored manual
 * offset. Recomputed rather than maintained as a running count because far more
 * than the status toggle invalidates such a count — moving an event to another
 * week, deleting it, changing its type, shifting a prayer across 2pm, or editing
 * a church event's duration all change what the total should be, and none of
 * those operations can be expected to know a cached number exists.
 *
 * Takes the week's dates rather than a week key so this stays free of dateUtils;
 * the caller owns the week-boundary question.
 *
 * Backups are skipped explicitly. They carry no status by design, so they can
 * never read as completed — but that shouldn't rest on the UI alone.
 */
export function deriveWeekGoalCounts(
  events: CalendarEvent[],
  isCompleted: (eventId: string, dateStr: string) => boolean,
  weekDates: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const dateStr of weekDates) {
    for (const occurrence of getEventsForDate(events, dateStr)) {
      if (occurrence.backup) continue;
      if (!isCompleted(occurrence.id, dateStr)) continue;
      const contrib = getGoalContribution(occurrence);
      if (!contrib) continue;
      totals[contrib.goalId] = (totals[contrib.goalId] ?? 0) + contrib.delta;
    }
  }

  return totals;
}

/**
 * Whether the event has started, and so is waiting on a report.
 *
 * The minute it starts on counts as started: an event at 2:14 is reportable from
 * 2:14, not from 2:15. Both sides are minute-resolution, so the strict form left
 * a one-minute hole where the event was under way and the app still said it
 * hadn't begun — most visible on a contact logged at the moment it happened,
 * which was created already in progress.
 */
export function hasEventStartPassed(event: CalendarEvent): boolean {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  if (event.date < todayStr) return true;
  if (event.date > todayStr) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= timeToMinutes(event.startTime);
}

// An event with no duration still needs a footprint for overlap/column packing,
// so it occupies a slice matching its fixed block size. This is layout geometry
// only; it is never its real time.
const CHECKBOX_LAYOUT_MINUTES = 30;

function layoutEndMinutes(event: CalendarEvent): number {
  if (!hasEndTime(event)) return timeToMinutes(event.startTime) + CHECKBOX_LAYOUT_MINUTES;
  return timeToMinutes(event.endTime);
}

export function computeEventLayout(events: CalendarEvent[]): Map<string, { col: number; numCols: number }> {
  if (events.length === 0) return new Map();

  const overlaps = (a: CalendarEvent, b: CalendarEvent) => {
    const aS = timeToMinutes(a.startTime), aE = layoutEndMinutes(a);
    const bS = timeToMinutes(b.startTime), bE = layoutEndMinutes(b);
    return aS < bE && bS < aE;
  };

  const n = events.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (x: number, y: number) => { parent[find(x)] = find(y); };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(events[i], events[j])) union(i, j);
    }
  }

  const groupMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(i);
  }

  const result = new Map<string, { col: number; numCols: number }>();

  for (const [, indices] of groupMap) {
    if (indices.length === 1) {
      result.set(events[indices[0]].id, { col: 0, numCols: 1 });
      continue;
    }

    // Sort: non-backup first (they get left columns), then by start time
    const sorted = [...indices].sort((a, b) => {
      const ea = events[a], eb = events[b];
      if (!!ea.backup !== !!eb.backup) return ea.backup ? 1 : -1;
      return timeToMinutes(ea.startTime) - timeToMinutes(eb.startTime);
    });

    const colEndTimes: number[] = [];
    const colAssignment: number[] = new Array(sorted.length);

    for (let i = 0; i < sorted.length; i++) {
      const e = events[sorted[i]];
      const startMin = timeToMinutes(e.startTime);
      let assigned = -1;
      for (let c = 0; c < colEndTimes.length; c++) {
        if (colEndTimes[c] <= startMin) {
          assigned = c;
          break;
        }
      }
      if (assigned === -1) {
        assigned = colEndTimes.length;
        colEndTimes.push(0);
      }
      colAssignment[i] = assigned;
      colEndTimes[assigned] = layoutEndMinutes(e);
    }

    const numCols = colEndTimes.length;
    sorted.forEach((originalIdx, i) => {
      result.set(events[originalIdx].id, { col: colAssignment[i], numCols });
    });
  }

  return result;
}
