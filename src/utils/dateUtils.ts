import { getISOWeek, getISOWeekYear, format, startOfISOWeek, addWeeks, subWeeks } from 'date-fns';

export function getWeekKey(date: Date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getIndicatorStorageKey(date: Date = new Date()): string {
  return `indicators_${getWeekKey(date)}`;
}

export function isNewWeek(lastResetDate: string | null): boolean {
  if (!lastResetDate) return true;
  const last = new Date(lastResetDate);
  const now = new Date();
  return getWeekKey(last) !== getWeekKey(now);
}

export function getMondayOfWeek(date: Date = new Date()): Date {
  return startOfISOWeek(date);
}

export function getPastWeekKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = subWeeks(now, i);
    keys.push(getWeekKey(d));
  }
  return keys;
}

export function formatWeekLabel(weekKey: string): string {
  // weekKey format: "2024-W01"
  const [year, week] = weekKey.split('-W');
  const jan4 = new Date(parseInt(year), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (parseInt(week) - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${format(monday, 'MMM d')} – ${format(sunday, 'MMM d')}`;
}

export function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, '0');
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

export function parseTimeString(timeStr: string): { hour: number; minute: number } {
  const [time, ampm] = timeStr.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

export function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function addWeeksToDate(date: Date, weeks: number): Date {
  return addWeeks(date, weeks);
}

export function addMinutesToTimeString(timeStr: string, minutes: number): string {
  const [time, ampm] = timeStr.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const total = hour * 60 + minute + minutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h12}:${mm} ${suffix}`;
}
