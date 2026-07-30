import { useCallback } from 'react';
import { EventStatus } from '../utils/eventUtils';
import { EVENT_STATUSES_KEY, statusKey } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueDelete, enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type EventStatusMap = Record<string, EventStatus>;

const EMPTY: EventStatusMap = {};

export function useEventStatuses() {
  const { user } = useAuth();
  const { value: statuses, current, write, reload } = useStoredState<EventStatusMap>(EVENT_STATUSES_KEY, EMPTY);

  const getStatus = useCallback(
    (eventId: string, dateStr: string): EventStatus | undefined => statuses[statusKey(eventId, dateStr)],
    [statuses],
  );

  const setStatus = useCallback(
    async (eventId: string, dateStr: string, status: EventStatus | undefined) => {
      const key = statusKey(eventId, dateStr);
      await write(current => {
        const next = { ...current };
        if (status === undefined) delete next[key];
        else next[key] = status;
        return next;
      });

      if (!user) return;
      const identity = `${eventId}|${dateStr}`;
      const row = { user_id: user.id, event_id: eventId, occurrence_date: dateStr };
      // Clearing a status tombstones the row so the clear reaches other devices;
      // dropping the row locally would just let the next pull resurrect it.
      if (status === undefined) await enqueueDelete('event_statuses', identity, row);
      else await enqueueUpsert('event_statuses', identity, { ...row, status });
    },
    [user, write],
  );

  /**
   * Carry an occurrence's status across to a new date.
   *
   * A status is keyed `eventId::date`, so the date is part of its identity. Moving
   * an event without this leaves the record stranded on a date the event no longer
   * occupies, and the lookup at the new date finds nothing — which EventBlock
   * renders as `pending`, so a completed event silently reverts to unreported.
   *
   * One `write` rather than a clear followed by a set: two writes would publish an
   * intermediate map where the status exists at neither date, and every subscribed
   * screen would flash `pending` between them. The old row gets a tombstone so the
   * move propagates instead of leaving a duplicate on another device.
   */
  const moveStatus = useCallback(
    async (eventId: string, fromDate: string, toDate: string) => {
      if (fromDate === toDate) return;
      const fromKey = statusKey(eventId, fromDate);
      const status = current.current[fromKey];
      if (status === undefined) return;

      await write(existing => {
        const next = { ...existing };
        delete next[fromKey];
        next[statusKey(eventId, toDate)] = status;
        return next;
      });

      if (!user) return;
      await enqueueDelete('event_statuses', `${eventId}|${fromDate}`, {
        user_id: user.id, event_id: eventId, occurrence_date: fromDate,
      });
      await enqueueUpsert('event_statuses', `${eventId}|${toDate}`, {
        user_id: user.id, event_id: eventId, occurrence_date: toDate, status,
      });
    },
    [current, user, write],
  );

  return { statuses, getStatus, setStatus, moveStatus, reload };
}
