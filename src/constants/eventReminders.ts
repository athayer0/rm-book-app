/** How long before an event's start the reminder notification can fire. */
export const EVENT_REMINDER_MINUTE_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60];

export function eventReminderLabel(minutes: number): string {
  if (minutes === 0) return 'At start time';
  if (minutes === 60) return '1 hour';
  return `${minutes} min`;
}
