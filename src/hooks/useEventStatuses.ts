import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { EventStatus } from '../utils/eventUtils';

export type EventStatusMap = Record<string, EventStatus>;

const STORAGE_KEY = 'event_statuses';

export function useEventStatuses() {
  const [statuses, setStatuses] = useState<EventStatusMap>({});

  useEffect(() => {
    getItem<EventStatusMap>(STORAGE_KEY).then(stored => {
      if (stored) setStatuses(stored);
    });
  }, []);

  const getStatus = useCallback(
    (eventId: string, dateStr: string): EventStatus | undefined =>
      statuses[`${eventId}::${dateStr}`],
    [statuses],
  );

  const setStatus = useCallback(
    async (eventId: string, dateStr: string, status: EventStatus | undefined) => {
      const key = `${eventId}::${dateStr}`;
      const updated = { ...statuses };
      if (status === undefined) {
        delete updated[key];
      } else {
        updated[key] = status;
      }
      setStatuses(updated);
      await setItem(STORAGE_KEY, updated);
    },
    [statuses],
  );

  return { statuses, getStatus, setStatus };
}
