import { useMemo } from 'react';
import { findUnreportedOccurrences } from '../utils/eventUtils';
import { useCalendarEvents } from './useCalendarEvents';
import { useEventReport } from './useEventReport';
import { useEventTypeDefinitions } from './useEventTypeDefinitions';

/**
 * The unreported backlog and the way to clear it.
 *
 * Reporting is `useEventReport`'s job, handed straight back so the backlog can't
 * become a second, quieter definition of what a report does; `undefined` clears the
 * status, which returns the occurrence to the backlog.
 */
export function useUnreported() {
  const { events } = useCalendarEvents();
  const { getStatus, report } = useEventReport();
  const { byId: eventTypeById } = useEventTypeDefinitions();

  const unreported = useMemo(
    () => findUnreportedOccurrences(events, getStatus, new Date(), eventTypeById),
    [events, getStatus, eventTypeById],
  );

  return { unreported, count: unreported.length, report, statusOf: getStatus };
}
