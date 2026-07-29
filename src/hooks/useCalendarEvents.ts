import { useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarEvent, generateId, getEventsForDate } from '../utils/eventUtils';
import { CALENDAR_EVENTS_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

const EMPTY: CalendarEvent[] = [];

export function useCalendarEvents() {
  const { user } = useAuth();
  const { value: events, current, write, reload } = useStoredState<CalendarEvent[]>(CALENDAR_EVENTS_KEY, EMPTY);

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

  const updateEvent = useCallback(async (id: string, changes: Partial<CalendarEvent>) => {
    await persist(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e), id);
  }, [persist]);

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
