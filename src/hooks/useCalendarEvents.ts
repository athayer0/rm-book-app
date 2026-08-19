import { useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarEvent, generateId, getEventsForDate } from '../utils/eventUtils';
import { CALENDAR_EVENTS_KEY, EVENT_STATUSES_KEY } from '../constants/storageKeys';
import { getItem, multiSet, setItem } from '../utils/storage';
import { useStoredState } from './useStoredState';
import { useEventStatuses } from './useEventStatuses';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

const EMPTY: CalendarEvent[] = [];

/**
 * Take a person off every event they were on.
 *
 * An id with no person behind it renders as "Unknown person" — a real state, since
 * it also covers someone who simply hasn't synced yet, but not one a delete should
 * be leaving behind.
 *
 * A plain function rather than part of the hook: usePeople is the caller, and
 * mounting this whole hook there would subscribe every People screen to the event
 * list and its statuses to do one write. Writing the key directly is the route
 * pullAll already takes — useStoredState's subscription hands the new list to any
 * live calendar screen, so this needs no hook mounted to be seen.
 *
 * Empty becomes `undefined`, matching what the edit form stores, so the last
 * person coming off an event syncs as a cleared column rather than an empty array.
 */
export async function detachPersonFromEvents(personId: string, userId?: string): Promise<void> {
  const events = (await getItem<CalendarEvent[]>(CALENDAR_EVENTS_KEY)) ?? [];
  const changed: CalendarEvent[] = [];

  const next = events.map(e => {
    if (!e.people?.includes(personId)) return e;
    const remaining = e.people.filter(id => id !== personId);
    const updated = { ...e, people: remaining.length ? remaining : undefined };
    changed.push(updated);
    return updated;
  });

  if (changed.length === 0) return;
  await setItem(CALENDAR_EVENTS_KEY, next);
  if (!userId) return;
  for (const e of changed) {
    await enqueueUpsert('calendar_events', e.id, { ...e, user_id: userId });
  }
}

export function useCalendarEvents() {
  const { user } = useAuth();
  const { value: events, current, write, reload } = useStoredState<CalendarEvent[]>(CALENDAR_EVENTS_KEY, EMPTY);
  const {
    planStatusMove, syncStatusMove,
    planStatusCarve, syncStatusCarve,
    planStatusBulkCarve, syncStatusBulkCarve,
  } = useEventStatuses();

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

  /**
   * Edit a single occurrence of a recurring series, leaving the rest of the
   * series untouched. An edit scoped to "this event only" is, functionally,
   * "exclude this date from the series and add a fresh standalone event with
   * whatever changed" — the same carve deleteOccurrence does, minus the delete.
   *
   * `changes` merges over the series row the way updateEvent's do, so a caller
   * can pass just the fields that moved (a drag) or the whole form (the editor)
   * alike. Any status already recorded for this occurrence follows to the new
   * row so it doesn't read as pending again.
   */
  const updateOccurrence = useCallback(async (id: string, occurrenceDate: string, changes: Partial<CalendarEvent>) => {
    const row = current.current.find(e => e.id === id);
    if (!row) return;
    if (!row.recurring) return updateEvent(id, changes);

    const carved: Omit<CalendarEvent, 'id'> = {
      ...row,
      ...changes,
      date: changes.date ?? occurrenceDate,
      recurring: false,
      recurringRule: undefined,
      recurringUntil: undefined,
      recurringDays: undefined,
      excludedDates: undefined,
    };
    const newEvent = { ...carved, id: generateId() };
    const excludedDates = [...(row.excludedDates ?? []), occurrenceDate];
    const nextEvents = current.current
      .map(e => e.id === id ? { ...e, excludedDates } : e)
      .concat(newEvent);

    const statusMove = planStatusCarve(id, occurrenceDate, newEvent.id, newEvent.date);

    if (statusMove) {
      await multiSet([
        [CALENDAR_EVENTS_KEY, nextEvents],
        [EVENT_STATUSES_KEY, statusMove.next],
      ]);
    } else {
      await write(() => nextEvents);
    }

    if (user) {
      const updatedRow = nextEvents.find(e => e.id === id);
      if (updatedRow) await enqueueUpsert('calendar_events', updatedRow.id, { ...updatedRow, user_id: user.id });
      await enqueueUpsert('calendar_events', newEvent.id, { ...newEvent, user_id: user.id });
      if (statusMove) await syncStatusCarve(id, occurrenceDate, newEvent.id, newEvent.date, statusMove.status);
    }
    return newEvent;
  }, [current, write, user, updateEvent, planStatusCarve, syncStatusCarve]);

  /**
   * Edit a recurring series from occurrenceDate onward, leaving earlier
   * occurrences alone. Ends the series the day before occurrenceDate — the
   * same cutoff deleteFromDate uses — and starts a fresh row there carrying
   * `changes`, since a mid-series edit (a new time, a new title) has no
   * existing row it could live on without also rewriting the past.
   *
   * Cutting at or before the first occurrence is really editing the whole
   * series, so it falls through to updateEvent — the same reasoning
   * deleteFromDate uses to fall through to deleteEvent.
   *
   * Any excluded dates on or after occurrenceDate (occurrences deleted
   * individually before this edit) carry forward to the new row; a date
   * someone already removed from the series shouldn't reappear because the
   * rest of the series changed.
   */
  const updateFromDate = useCallback(async (id: string, occurrenceDate: string, changes: Partial<CalendarEvent>) => {
    const row = current.current.find(e => e.id === id);
    if (!row) return;
    if (!row.recurring || row.date >= occurrenceDate) return updateEvent(id, changes);

    const recurringUntil = format(subDays(parseISO(occurrenceDate), 1), 'yyyy-MM-dd');
    const carriedExcluded = (row.excludedDates ?? []).filter(d => d >= occurrenceDate);
    const newRowData: Omit<CalendarEvent, 'id'> = {
      ...row,
      ...changes,
      date: changes.date ?? occurrenceDate,
      excludedDates: carriedExcluded.length ? carriedExcluded : undefined,
    };
    const newEvent = { ...newRowData, id: generateId() };
    const nextEvents = current.current
      .map(e => e.id === id ? { ...e, recurringUntil } : e)
      .concat(newEvent);

    const statusMove = planStatusBulkCarve(id, newEvent.id, occurrenceDate);

    if (statusMove) {
      await multiSet([
        [CALENDAR_EVENTS_KEY, nextEvents],
        [EVENT_STATUSES_KEY, statusMove.next],
      ]);
    } else {
      await write(() => nextEvents);
    }

    if (user) {
      const updatedRow = nextEvents.find(e => e.id === id);
      if (updatedRow) await enqueueUpsert('calendar_events', updatedRow.id, { ...updatedRow, user_id: user.id });
      await enqueueUpsert('calendar_events', newEvent.id, { ...newEvent, user_id: user.id });
      if (statusMove) await syncStatusBulkCarve(id, newEvent.id, statusMove.moved);
    }
    return newEvent;
  }, [current, write, user, updateEvent, planStatusBulkCarve, syncStatusBulkCarve]);

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

  /** Every event of a given type — used when deleting an event type that's still in use. */
  const deleteEventsOfType = useCallback(async (type: string) => {
    const toDelete = current.current.filter(e => e.type === type);
    if (toDelete.length === 0) return;
    await write(prev => prev.filter(e => e.type !== type));
    if (user) {
      for (const e of toDelete) {
        await enqueueDelete('calendar_events', e.id, { user_id: user.id, id: e.id });
      }
    }
  }, [current, write, user]);

  return {
    events, addEvent, updateEvent, updateOccurrence, updateFromDate,
    deleteEvent, deleteOccurrence, deleteFromDate,
    getForDate, deleteAllEvents, deleteEventsOfType, reload,
  };
}
