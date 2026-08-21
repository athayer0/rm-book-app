import * as Notifications from 'expo-notifications';
import { addDays, format } from 'date-fns';
import type { TFunction } from 'i18next';
import { CalendarEvent, getEventsForDate } from '../utils/eventUtils';
import { parseTimeString } from '../utils/dateUtils';

// Fixed so re-scheduling (a new time, or the settings row arriving from
// another device) replaces the existing trigger instead of stacking a second
// daily notification alongside it.
const DAILY_REVIEW_NOTIFICATION_ID = 'daily-review-reminder';

/** Tags the notification so the tap handler can tell it apart from any other kind. */
export const DAILY_REVIEW_DATA = { type: 'daily-review' } as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Returns whether permission is granted, requesting it if not yet determined. */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Idempotent — safe to call on every settings change; moves the time rather than duplicating the reminder. */
export async function scheduleDailyReview(hour: number, minute: number, t: TFunction): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_NOTIFICATION_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REVIEW_NOTIFICATION_ID,
    content: {
      title: t('notifications.dailyReviewTitle'),
      body: t('notifications.dailyReviewBody'),
      data: DAILY_REVIEW_DATA,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelDailyReview(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_NOTIFICATION_ID);
}

export function isDailyReviewResponse(response: Notifications.NotificationResponse): boolean {
  return response.notification.request.content.data?.type === DAILY_REVIEW_DATA.type;
}

// ── Per-event reminders ─────────────────────────────────────────────────
//
// One notification per upcoming occurrence, rather than one repeating
// notification — each event has its own time. That rules out scheduling the
// whole series up front: a daily/weekly event with no end date has no fixed
// count of future occurrences, and iOS caps an app at 64 pending local
// notifications in total (shared with the daily review reminder above).
// Instead this reconciles a rolling window against "now" — cancel everything
// under this prefix and reschedule fresh from the current event list — run
// whenever the events or the setting change, and again on every foreground
// so the window keeps sliding forward as days pass.
const EVENT_REMINDER_ID_PREFIX = 'event-reminder:';
const EVENT_REMINDER_WINDOW_DAYS = 7;
// Leaves headroom under iOS's 64-pending cap for the daily review reminder
// plus whatever the OS itself is holding onto momentarily.
const EVENT_REMINDER_MAX_SCHEDULED = 60;

export const EVENT_REMINDER_DATA_TYPE = 'event-reminder';

function eventReminderIdentifier(eventId: string, dateStr: string): string {
  return `${EVENT_REMINDER_ID_PREFIX}${eventId}::${dateStr}`;
}

function eventReminderBody(leadMinutes: number, t: TFunction): string {
  if (leadMinutes === 0) return t('notifications.startingNow');
  if (leadMinutes === 60) return t('notifications.startsInOneHour');
  return t('notifications.startsInMinutes', { count: leadMinutes });
}

async function cancelAllEventReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.identifier.startsWith(EVENT_REMINDER_ID_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function clearEventReminders(): Promise<void> {
  await cancelAllEventReminders();
}

/** Full rebuild rather than a diff — simpler, and correct even when an event's own time changed. */
export async function syncEventReminders(
  events: CalendarEvent[],
  leadMinutes: number,
  excludedTypeIds: string[] = [],
  t: TFunction,
): Promise<void> {
  await cancelAllEventReminders();

  const excluded = new Set(excludedTypeIds);
  const now = new Date();
  const occurrences: { event: CalendarEvent; date: string; notifyAt: Date }[] = [];

  for (let offset = 0; offset < EVENT_REMINDER_WINDOW_DAYS; offset++) {
    const dateStr = format(addDays(now, offset), 'yyyy-MM-dd');
    const [year, month, day] = dateStr.split('-').map(Number);

    for (const occurrence of getEventsForDate(events, dateStr)) {
      if (excluded.has(occurrence.type)) continue;
      const { hour, minute } = parseTimeString(occurrence.startTime);
      const start = new Date(year, month - 1, day, hour, minute, 0, 0);
      const notifyAt = new Date(start.getTime() - leadMinutes * 60_000);
      if (notifyAt.getTime() <= now.getTime()) continue;
      occurrences.push({ event: occurrence, date: dateStr, notifyAt });
    }
  }

  occurrences.sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime());

  await Promise.all(
    occurrences.slice(0, EVENT_REMINDER_MAX_SCHEDULED).map(({ event, date, notifyAt }) =>
      Notifications.scheduleNotificationAsync({
        identifier: eventReminderIdentifier(event.id, date),
        content: {
          title: event.title || t('addEditEvent.eventTitle'),
          body: eventReminderBody(leadMinutes, t),
          data: { type: EVENT_REMINDER_DATA_TYPE, eventId: event.id, date },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notifyAt,
        },
      }),
    ),
  );
}

/** Non-null only for a tap on one of this module's own event reminders. */
export function eventReminderResponseData(
  response: Notifications.NotificationResponse,
): { eventId: string; date: string } | null {
  const data = response.notification.request.content.data;
  if (data?.type !== EVENT_REMINDER_DATA_TYPE) return null;
  return { eventId: data.eventId as string, date: data.date as string };
}
