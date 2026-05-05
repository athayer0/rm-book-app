import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';

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
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getEventsForDate(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  const target = dateStr;
  const results: CalendarEvent[] = [];

  events.forEach(event => {
    if (!event.recurring) {
      if (event.date === target) results.push(event);
      return;
    }

    const startDate = parseISO(event.date);
    const targetDate = parseISO(target);

    if (targetDate < startDate) return;

    switch (event.recurringRule) {
      case 'daily': {
        results.push({ ...event, date: target });
        break;
      }
      case 'weekly': {
        const startDay = startDate.getDay();
        const targetDay = targetDate.getDay();
        if (startDay === targetDay) {
          results.push({ ...event, date: target });
        }
        break;
      }
      case 'monthly': {
        if (startDate.getDate() === targetDate.getDate()) {
          results.push({ ...event, date: target });
        }
        break;
      }
    }
  });

  return results.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function eventTopOffset(startTime: string, gridStartHour: number = 6): number {
  const [time, ampm] = startTime.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const totalMinutes = (hour - gridStartHour) * 60 + minute;
  return (totalMinutes / 30) * 50;
}

export function eventHeight(startTime: string, endTime: string): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const duration = Math.max(endMinutes - startMinutes, 30);
  return (duration / 30) * 50;
}

function timeToMinutes(timeStr: string): number {
  const [time, ampm] = timeStr.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}
