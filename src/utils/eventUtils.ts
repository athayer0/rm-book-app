import { format, parseISO } from 'date-fns';
import { DEFAULT_SLOT_HEIGHT } from '../constants/eventSizes';

export type EventStatus = 'completed' | 'failed' | 'pending';

export const TRACKABLE_TYPES = new Set(['prayer', 'temple', 'church', 'scripture', 'exercise']);

export interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  recurring: boolean;
  recurringRule?: 'daily' | 'weekly' | 'monthly';
  completed?: boolean;
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

    switch (event.recurringRule) {
      case 'daily': {
        results.push({ ...event, date: dateStr });
        break;
      }
      case 'weekly': {
        const startDay = startDate.getDay();
        const targetDay = targetDate.getDay();
        if (startDay === targetDay) {
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
// Floored at a 15-minute row so the shortest events stay tappable at any density.
export function eventBlockHeight(startTime: string, endTime: string, slotHeight: number = DEFAULT_SLOT_HEIGHT): number {
  return Math.max(eventHeight(startTime, endTime, slotHeight) - 1, slotHeight / 2 - 1);
}

export function getKIContribution(event: CalendarEvent): { kiId: string; delta: number } | null {
  switch (event.type) {
    case 'prayer': {
      const { hour } = parseTime(event.startTime);
      return { kiId: hour < 14 ? 'morning_prayer' : 'nightly_prayer', delta: 1 };
    }
    case 'temple':
      return { kiId: 'temple_attendance', delta: 1 };
    case 'church': {
      const mins = Math.max(0, timeToMinutes(event.endTime) - timeToMinutes(event.startTime));
      return { kiId: 'church_hours', delta: Math.max(1, Math.round(mins / 60)) };
    }
    case 'scripture':
      return { kiId: 'personal_study', delta: 1 };
    case 'exercise':
      return { kiId: 'times_exercised', delta: 1 };
    default:
      return null;
  }
}

export function hasEventStartPassed(event: CalendarEvent): boolean {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  if (event.date < todayStr) return true;
  if (event.date > todayStr) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins > timeToMinutes(event.startTime);
}

export function computeEventLayout(events: CalendarEvent[]): Map<string, { col: number; numCols: number }> {
  if (events.length === 0) return new Map();

  const overlaps = (a: CalendarEvent, b: CalendarEvent) => {
    const aS = timeToMinutes(a.startTime), aE = timeToMinutes(a.endTime);
    const bS = timeToMinutes(b.startTime), bE = timeToMinutes(b.endTime);
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
      colEndTimes[assigned] = timeToMinutes(e.endTime);
    }

    const numCols = colEndTimes.length;
    sorted.forEach((originalIdx, i) => {
      result.set(events[originalIdx].id, { col: colAssignment[i], numCols });
    });
  }

  return result;
}
