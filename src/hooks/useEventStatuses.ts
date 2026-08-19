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
   * What the map becomes when an occurrence's date changes — computed, not written.
   *
   * A status is keyed `eventId::date`, so the date is part of its identity and a
   * moved event stops matching its own record. The lookup at the new date finds
   * nothing, and resolveEventStatus reads that as pending, so a completed event
   * appears to revert.
   *
   * The write is deliberately left to the caller. Storing this separately from the
   * event list means two notifications in two ticks, and React paints between them
   * — one frame with the event moved and its status not, which is the pending flash.
   * Handing back the next map lets updateEvent commit both keys in a single write,
   * so subscribers hear once and there is no intermediate frame to paint.
   *
   * Returns null when there is nothing to carry.
   */
  const planStatusMove = useCallback(
    (
      eventId: string,
      fromDate: string,
      toDate: string,
    ): { next: EventStatusMap; status: EventStatus } | null => {
      if (fromDate === toDate) return null;
      const fromKey = statusKey(eventId, fromDate);
      const status = current.current[fromKey];
      if (status === undefined) return null;

      const next = { ...current.current };
      delete next[fromKey];
      next[statusKey(eventId, toDate)] = status;
      return { next, status };
    },
    [current],
  );

  /**
   * Propagate a move that has already been written locally.
   *
   * The old row is tombstoned rather than dropped, so the move reaches other
   * devices instead of leaving the status at both dates.
   */
  const syncStatusMove = useCallback(
    async (eventId: string, fromDate: string, toDate: string, status: EventStatus) => {
      if (!user) return;
      await enqueueDelete('event_statuses', `${eventId}|${fromDate}`, {
        user_id: user.id, event_id: eventId, occurrence_date: fromDate,
      });
      await enqueueUpsert('event_statuses', `${eventId}|${toDate}`, {
        user_id: user.id, event_id: eventId, occurrence_date: toDate, status,
      });
    },
    [user],
  );

  /**
   * What the map becomes when a single occurrence's status moves onto a
   * different id — computed, not written. Used when a recurring edit scoped to
   * "this event only" carves an occurrence into its own standalone row: the new
   * row has a different id (and possibly a different date, if the edit moved
   * it), and a status recorded against the old id::date pair would otherwise
   * strand there, reading as pending again.
   *
   * Returns null when there is nothing to carry, same as planStatusMove.
   */
  const planStatusCarve = useCallback(
    (fromId: string, fromDate: string, toId: string, toDate: string): { next: EventStatusMap; status: EventStatus } | null => {
      const fromKey = statusKey(fromId, fromDate);
      const status = current.current[fromKey];
      if (status === undefined) return null;

      const next = { ...current.current };
      delete next[fromKey];
      next[statusKey(toId, toDate)] = status;
      return { next, status };
    },
    [current],
  );

  /** Propagate a carve that has already been written locally. Same tombstone
   * reasoning as syncStatusMove. */
  const syncStatusCarve = useCallback(
    async (fromId: string, fromDate: string, toId: string, toDate: string, status: EventStatus) => {
      if (!user) return;
      await enqueueDelete('event_statuses', `${fromId}|${fromDate}`, {
        user_id: user.id, event_id: fromId, occurrence_date: fromDate,
      });
      await enqueueUpsert('event_statuses', `${toId}|${toDate}`, {
        user_id: user.id, event_id: toId, occurrence_date: toDate, status,
      });
    },
    [user],
  );

  /**
   * What the map becomes when every occurrence at or after `fromDateInclusive`
   * moves off `fromId` onto `toId` — computed, not written. Used when a
   * recurring edit scoped to "this and future" splits a series in two: the new
   * row picks up every date from the split point on, and any of those already
   * had a status recorded against the old id.
   *
   * Returns null when there is nothing to carry.
   */
  const planStatusBulkCarve = useCallback(
    (fromId: string, toId: string, fromDateInclusive: string): { next: EventStatusMap; moved: { date: string; status: EventStatus }[] } | null => {
      const prefix = `${fromId}::`;
      const moved: { date: string; status: EventStatus }[] = [];
      const next = { ...current.current };
      for (const [key, status] of Object.entries(current.current)) {
        if (!key.startsWith(prefix)) continue;
        const date = key.slice(prefix.length);
        if (date < fromDateInclusive) continue;
        delete next[key];
        next[statusKey(toId, date)] = status;
        moved.push({ date, status });
      }
      return moved.length ? { next, moved } : null;
    },
    [current],
  );

  /** Propagate a bulk carve that has already been written locally. */
  const syncStatusBulkCarve = useCallback(
    async (fromId: string, toId: string, moved: { date: string; status: EventStatus }[]) => {
      if (!user) return;
      for (const { date, status } of moved) {
        await enqueueDelete('event_statuses', `${fromId}|${date}`, {
          user_id: user.id, event_id: fromId, occurrence_date: date,
        });
        await enqueueUpsert('event_statuses', `${toId}|${date}`, {
          user_id: user.id, event_id: toId, occurrence_date: date, status,
        });
      }
    },
    [user],
  );

  return {
    statuses, getStatus, setStatus, planStatusMove, syncStatusMove,
    planStatusCarve, syncStatusCarve, planStatusBulkCarve, syncStatusBulkCarve,
    reload,
  };
}
