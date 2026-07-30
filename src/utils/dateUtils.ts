import { getISOWeek, getISOWeekYear, format, addWeeks, addDays, parseISO } from 'date-fns';

export function getWeekKey(date: Date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isNewWeek(lastResetDate: string | null): boolean {
  if (!lastResetDate) return true;
  const last = new Date(lastResetDate);
  const now = new Date();
  return getWeekKey(last) !== getWeekKey(now);
}

/**
 * The seven dates a week key covers, Monday first — the inverse of getWeekKey.
 *
 * Lives next to getWeekKey so the two cannot drift about where a week begins.
 * Goal counts are derived by summing the events inside a week, so a disagreement
 * here would land contributions in the neighbouring bucket.
 */
export function getWeekDates(weekKey: string): string[] {
  // weekKey format: "2024-W01". Jan 4th is always in ISO week 1.
  const [year, week] = weekKey.split('-W');
  const jan4 = new Date(parseInt(year), 0, 4);
  // getDay() calls Sunday 0; ISO calls it 7.
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (parseInt(week) - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}

export function formatWeekLabel(weekKey: string): string {
  const dates = getWeekDates(weekKey);
  return `${format(parseISO(dates[0]), 'MMM d')} – ${format(parseISO(dates[6]), 'MMM d')}`;
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

export function getWeekKeyByOffset(offset: number): string {
  return getWeekKey(addWeeks(new Date(), offset));
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
