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
  const { value: statuses, write, reload } = useStoredState<EventStatusMap>(EVENT_STATUSES_KEY, EMPTY);

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
   * Record many occurrences at once.
   *
   * Folded into a single `write` because the whole status map is serialised on
   * every call — reporting a month's backlog one setStatus at a time would
   * rewrite that map once per event. The queue ops stay per-occurrence, since
   * each is its own row in event_statuses.
   */
  const setStatuses = useCallback(
    async (entries: { eventId: string; dateStr: string; status: EventStatus }[]) => {
      if (entries.length === 0) return;
      await write(current => {
        const next = { ...current };
        for (const entry of entries) next[statusKey(entry.eventId, entry.dateStr)] = entry.status;
        return next;
      });

      if (!user) return;
      for (const entry of entries) {
        await enqueueUpsert('event_statuses', `${entry.eventId}|${entry.dateStr}`, {
          user_id: user.id,
          event_id: entry.eventId,
          occurrence_date: entry.dateStr,
          status: entry.status,
        });
      }
    },
    [user, write],
  );

  return { statuses, getStatus, setStatus, setStatuses, reload };
}
