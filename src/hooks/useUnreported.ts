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
  const { getStatus, setStatus } = useEventStatuses();

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

  return { unreported, count: unreported.length, report };
}
