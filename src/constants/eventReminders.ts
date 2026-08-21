import type { TFunction } from 'i18next';

/** How long before an event's start the reminder notification can fire. */
export const EVENT_REMINDER_MINUTE_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60];

export function eventReminderLabel(minutes: number, t: TFunction): string {
  if (minutes === 0) return t('reminders.atStartTime');
  if (minutes === 60) return t('reminders.oneHour');
  return t('reminders.minutes', { count: minutes });
}
