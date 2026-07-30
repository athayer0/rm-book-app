import { useCallback, useMemo } from 'react';
import { CalendarEvent, EventStatus, findUnreportedOccurrences } from '../utils/eventUtils';
import { useCalendarEvents } from './useCalendarEvents';
import { useEventStatuses } from './useEventStatuses';

/**
 * The unreported backlog and the two ways to clear it.
 *
 * Reporting writes a status and nothing else. Goal counts are derived from
 * statuses rather than accumulated, so the week each occurrence belongs to picks
 * up its contribution without being told — and gives it back if the event is
 * later moved, retyped, or deleted.
 */
export function useUnreported() {
  const { events } = useCalendarEvents();
  const { getStatus, setStatus, setStatuses } = useEventStatuses();

  const unreported = useMemo(
    () => findUnreportedOccurrences(events, (id, dateStr) => getStatus(id, dateStr) !== undefined),
    [events, getStatus],
  );

  const report = useCallback(
    async (occurrence: CalendarEvent, status: EventStatus) => {
      await setStatus(occurrence.id, occurrence.date, status);
    },
    [setStatus],
  );

  /**
   * Report the whole backlog at once. Returns how many occurrences were written.
   *
   * One setStatuses call rather than a loop of setStatus: the status map is
   * serialised in full on every write, so reporting a month one event at a time
   * would rewrite it once per event.
   */
  const reportAll = useCallback(
    async (status: EventStatus): Promise<number> => {
      const batch = unreported;
      if (batch.length === 0) return 0;
      await setStatuses(batch.map(o => ({ eventId: o.id, dateStr: o.date, status })));
      return batch.length;
    },
    [unreported, setStatuses],
  );

  return { unreported, count: unreported.length, report, reportAll };
}
