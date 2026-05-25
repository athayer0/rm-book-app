import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { CalendarEvent, generateId, getEventsForDate } from '../utils/eventUtils';
import { enqueue } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export function useCalendarEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    getItem<CalendarEvent[]>('calendar_events').then(stored => {
      if (stored) setEvents(stored);
    });
  }, []);

  // Persist locally, then queue a remote upsert for the given event when signed in.
  const persist = useCallback(async (updated: CalendarEvent[], changedId: string) => {
    setEvents(updated);
    await setItem('calendar_events', updated);
    const row = updated.find(e => e.id === changedId);
    if (user && row) {
      await enqueue({ table: 'calendar_events', type: 'upsert', row: { ...row, user_id: user.id, updated_at: new Date().toISOString() } });
    }
  }, [user]);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>) => {
    const newEvent = { ...event, id: generateId() };
    await persist([...events, newEvent], newEvent.id);
    return newEvent;
  }, [events, persist]);

  const updateEvent = useCallback(async (id: string, changes: Partial<CalendarEvent>) => {
    await persist(events.map(e => e.id === id ? { ...e, ...changes } : e), id);
  }, [events, persist]);

  const deleteEvent = useCallback(async (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    await setItem('calendar_events', updated);
    if (user) await enqueue({ table: 'calendar_events', type: 'delete', row: { id, user_id: user.id } });
  }, [events, user]);

  const getForDate = useCallback((dateStr: string) => {
    return getEventsForDate(events, dateStr);
  }, [events]);

  const toggleComplete = useCallback(async (id: string) => {
    await persist(events.map(e => e.id === id ? { ...e, completed: !e.completed } : e), id);
  }, [events, persist]);

  const deleteAllEvents = useCallback(async () => {
    const toDelete = events;
    setEvents([]);
    await setItem('calendar_events', []);
    if (user) {
      for (const e of toDelete) {
        await enqueue({ table: 'calendar_events', type: 'delete', row: { id: e.id, user_id: user.id } });
      }
    }
  }, [events, user]);

  return { events, addEvent, updateEvent, deleteEvent, getForDate, toggleComplete, deleteAllEvents };
}

