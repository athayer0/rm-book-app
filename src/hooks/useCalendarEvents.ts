import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { CalendarEvent, generateId, getEventsForDate } from '../utils/eventUtils';

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    getItem<CalendarEvent[]>('calendar_events').then(stored => {
      if (stored) setEvents(stored);
    });
  }, []);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>) => {
    const newEvent = { ...event, id: generateId() };
    const updated = [...events, newEvent];
    setEvents(updated);
    await setItem('calendar_events', updated);
    return newEvent;
  }, [events]);

  const updateEvent = useCallback(async (id: string, changes: Partial<CalendarEvent>) => {
    const updated = events.map(e => e.id === id ? { ...e, ...changes } : e);
    setEvents(updated);
    await setItem('calendar_events', updated);
  }, [events]);

  const deleteEvent = useCallback(async (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    await setItem('calendar_events', updated);
  }, [events]);

  const getForDate = useCallback((dateStr: string) => {
    return getEventsForDate(events, dateStr);
  }, [events]);

  return { events, addEvent, updateEvent, deleteEvent, getForDate };
}
