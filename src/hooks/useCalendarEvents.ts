import { useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarEvent, generateId, getEventsForDate } from '../utils/eventUtils';
import { CALENDAR_EVENTS_KEY, EVENT_STATUSES_KEY } from '../constants/storageKeys';
import { multiSet } from '../utils/storage';
import { useStoredState } from './useStoredState';
import { useEventStatuses } from './useEventStatuses';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

const EMPTY: CalendarEvent[] = [];

export function useCalendarEvents() {
  const { user } = useAuth();
  const { value: events, current, write, reload } = useStoredState<CalendarEvent[]>(CALENDAR_EVENTS_KEY, EMPTY);
  const { planStatusMove, syncStatusMove } = useEventStatuses();

  // Persist locally, then queue a remote upsert for the given event when signed in.
  const persist = useCallback(async (update: (current: CalendarEvent[]) => CalendarEvent[], changedId: string) => {
    const updated = await write(update);
    const row = updated.find(e => e.id === changedId);
    if (user && row) await enqueueUpsert('calendar_events', row.id, { ...row, user_id: user.id });
  }, [write, user]);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>) => {
    const newEvent = { ...event, id: generateId() };
    await persist(prev => [...prev, newEvent], newEvent.id);
    return newEvent;
  }, [persist]);

  /**
   * Apply changes to an event, keeping its status attached if the date moved.
   *
   * The re-key lives here rather than at the call sites because both of them —
   * the drag handler and the edit modal — pass a new `date` without any idea that
   * a status is keyed to it. A caller that has to remember an invariant is one
   * that will eventually forget.
   *
   * Only for non-recurring events. On a series, `date` is the anchor rather than
   * an occurrence date, and moving it does not shift occurrences by a fixed
   * offset: a daily series keeps every date after the new anchor, a weekly one
   * takes its days from `recurringDays`, and only a monthly one really slides. So
   * there is no single status to carry and no rule that would carry it correctly.
   */
  const updateEvent = useCallback(async (id: string, changes: Partial<CalendarEvent>) => {
    const before = current.current.find(e => e.id === id);
    const apply = (list: CalendarEvent[]) => list.map(e => e.id === id ? { ...e, ...changes } : e);

    // Recurrence being switched on in the same edit is excluded too: the single
    // status the event had stops identifying a single occurrence.
    const dateMoved = !!before && !!changes.date && changes.date !== before.date
      && !before.recurring && changes.recurring !== true;
    const statusMove = dateMoved ? planStatusMove(id, before!.date, changes.date!) : null;

    if (!statusMove) {
      await persist(apply, id);
      return;
    }

    // Both keys in one multiSet. Writing them separately notifies subscribers in
    // two different ticks — each setItem awaits — so React paints in between, and
    // that frame has the event at its new date with its status still at the old
    // one: the badge flashes pending. multiSet awaits once and then notifies both
    // keys synchronously, which React coalesces into a single render.
    //
    // Writing a key from outside its owning hook is the same route pullAll takes:
    // the subscription in useStoredState adopts the new value, so both hooks stay
    // current without either calling its own write().
    const nextEvents = apply(current.current);
    await multiSet([
      [CALENDAR_EVENTS_KEY, nextEvents],
      [EVENT_STATUSES_KEY, statusMove.next],
    ]);

    const row = nextEvents.find(e => e.id === id);
    if (user && row) await enqueueUpsert('calendar_events', row.id, { ...row, user_id: user.id });
    await syncStatusMove(id, before!.date, changes.date!, statusMove.status);
  }, [persist, current, planStatusMove, syncStatusMove, user]);

  const deleteEvent = useCallback(async (id: string) => {
    await write(prev => prev.filter(e => e.id !== id));
    if (user) await enqueueDelete('calendar_events', id, { user_id: user.id, id });
  }, [write, user]);

  // Occurrences are projected from a single stored row and share its id, so deleting one
  // has to be expressed against the series rather than by removing a row.

  /** Drop a single occurrence, leaving the rest of the series running. */
  const deleteOccurrence = useCallback(async (id: string, dateStr: string) => {
    const row = current.current.find(e => e.id === id);
    if (!row) return;
    if (!row.recurring) return deleteEvent(id);
    const excludedDates = [...(row.excludedDates ?? []), dateStr];
    await persist(prev => prev.map(e => e.id === id ? { ...e, excludedDates } : e), id);
  }, [current, persist, deleteEvent]);

  /** End the series before dateStr, removing that occurrence and every later one. */
  const deleteFromDate = useCallback(async (id: string, dateStr: string) => {
    const row = current.current.find(e => e.id === id);
    if (!row) return;
    // Cutting at (or before) the first occurrence leaves nothing, so drop the row itself.
    if (!row.recurring || row.date >= dateStr) return deleteEvent(id);
    const recurringUntil = format(subDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
    await persist(prev => prev.map(e => e.id === id ? { ...e, recurringUntil } : e), id);
  }, [current, persist, deleteEvent]);

  const getForDate = useCallback((dateStr: string) => {
    return getEventsForDate(events, dateStr);
  }, [events]);

  const deleteAllEvents = useCallback(async () => {
    const toDelete = current.current;
    await write(() => []);
    if (user) {
      for (const e of toDelete) {
        await enqueueDelete('calendar_events', e.id, { user_id: user.id, id: e.id });
      }
    }
  }, [current, write, user]);

  return { events, addEvent, updateEvent, deleteEvent, deleteOccurrence, deleteFromDate, getForDate, deleteAllEvents, reload };
}
