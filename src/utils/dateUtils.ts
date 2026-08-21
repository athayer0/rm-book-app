import { getISOWeek, getISOWeekYear, format, addWeeks, addMonths, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { dateFnsLocale, datePattern } from './dateFnsLocale';

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

export function formatWeekLabel(weekKey: string, language: 'en' | 'es' = 'en'): string {
  const dates = getWeekDates(weekKey);
  const locale = dateFnsLocale(language);
  const pattern = datePattern('monthDay', language);
  return `${format(parseISO(dates[0]), pattern, { locale })} – ${format(parseISO(dates[6]), pattern, { locale })}`;
}

export function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, '0');
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

/**
 * "AM"/"PM" as Spanish actually writes it — lowercase with periods, not the
 * English capitals. Display only: every stored time and everything
 * `parseTimeString` reads stays in the canonical "9:05 AM" form regardless of
 * language, so this never touches the value itself, only what's drawn on
 * screen right before it's drawn.
 */
export function periodLabel(period: 'AM' | 'PM', language: 'en' | 'es'): string {
  if (language !== 'es') return period;
  return period === 'AM' ? 'a. m.' : 'p. m.';
}

/** A "9:05 AM"-form time string with its AM/PM localized for display — see periodLabel. */
export function localizeTime(timeStr: string, language: 'en' | 'es'): string {
  if (language !== 'es') return timeStr;
  return timeStr.replace('AM', 'a. m.').replace('PM', 'p. m.');
}

export function parseTimeString(timeStr: string): { hour: number; minute: number } {
  const [time, ampm] = timeStr.split(' ');
  let [hour, minute] = time.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

/**
 * The next half-hour mark on or after `now`, in the "9:30 AM" form the event
 * modal speaks. 9:29 gives 9:30 and 9:31 gives 10:00; a time already sitting on
 * the mark stays there, and seconds count, so 9:30:01 has missed it and rolls on
 * to 10:00.
 *
 * The last half hour of the day has no later mark to reach, so it holds at 11:30
 * PM rather than wrapping to a midnight that reads as the *start* of the day
 * being viewed — the caller supplies the date separately, and rolling the clock
 * would not roll that with it.
 */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Single-letter weekday initial — `day` is JS's 0=Sunday convention. */
export function weekdayInitial(day: number, t: (key: string) => string): string {
  return t(`calendar.weekdayInitial.${WEEKDAY_KEYS[day]}`);
}

/** Two-letter weekday headers for a month grid, in the order `weekStart` puts them. */
export function weekdayShortLabels(weekStart: 'monday' | 'sunday', t: (key: string) => string): string[] {
  const order: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[] = weekStart === 'monday'
    ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return order.map(day => t(`calendar.weekdayShort.${day}`));
}

export function nextHalfHour(now: Date = new Date()): string {
  const elapsed = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0);
  const mark = Math.min(Math.ceil(elapsed / 30) * 30, 23 * 60 + 30);
  return formatTime(Math.floor(mark / 60), mark % 60);
}

export function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function getWeekKeyByOffset(offset: number): string {
  return getWeekKey(addWeeks(new Date(), offset));
}

export function getMonthKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function getMonthKeyByOffset(offset: number): string {
  return getMonthKey(addMonths(new Date(), offset));
}

/**
 * Every date inside a month key, the inverse of getMonthKey. Mirrors
 * getWeekDates: goal counts are derived by summing the events inside these
 * dates, so a disagreement here would land contributions in the wrong month.
 */
export function getMonthDates(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  return eachDayOfInterval({ start: startOfMonth(first), end: endOfMonth(first) })
    .map(d => format(d, 'yyyy-MM-dd'));
}

export function formatMonthLabel(monthKey: string, language: 'en' | 'es' = 'en'): string {
  const [year, month] = monthKey.split('-').map(Number);
  return format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: dateFnsLocale(language) });
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
