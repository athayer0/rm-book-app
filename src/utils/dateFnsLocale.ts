import { es } from 'date-fns/locale';
import { format, type Locale } from 'date-fns';

/** date-fns' own locale object for month/weekday names — undefined falls back to its English default. */
export function dateFnsLocale(language: 'en' | 'es'): Locale | undefined {
  return language === 'es' ? es : undefined;
}

/**
 * Which day-month-year format string to hand `format()`, by shape.
 *
 * date-fns format tokens are literal — 'MMM d' always renders month-then-day,
 * whichever locale draws the month name itself. English reads that order
 * naturally ("Aug 21"), but Spanish puts the day first ("21 de ago"), so the
 * *pattern* has to flip per language, not just the month name inside it.
 * `'de'` is quoted so it's the literal word, not parsed as a format token.
 */
export type DateShape = 'monthDay' | 'monthDayYear' | 'weekdayMonthDay' | 'weekdayMonthDayYear';

const DATE_PATTERNS: Record<'en' | 'es', Record<DateShape, string>> = {
  en: {
    monthDay: 'MMM d',
    monthDayYear: 'MMM d, yyyy',
    weekdayMonthDay: 'EEEE, MMM d',
    weekdayMonthDayYear: 'EEEE, MMM d, yyyy',
  },
  es: {
    monthDay: "d 'de' MMM",
    monthDayYear: "d 'de' MMM 'de' yyyy",
    weekdayMonthDay: "EEEE, d 'de' MMM",
    weekdayMonthDayYear: "EEEE, d 'de' MMM 'de' yyyy",
  },
};

export function datePattern(shape: DateShape, language: 'en' | 'es'): string {
  return DATE_PATTERNS[language][shape];
}

/**
 * A bare year, as it reads when it trails a day-and-month that's already on
 * screen beside it (the calendar header's "21 de ago" plus this). English
 * just states the number; Spanish keeps the same "de" that joins day-to-month
 * running on into year, so the whole line reads as one date rather than a
 * number tacked on the end.
 */
export function yearLabel(date: Date, language: 'en' | 'es'): string {
  const year = format(date, 'yyyy');
  return language === 'es' ? `de ${year}` : year;
}
