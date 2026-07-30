import { useCallback, useMemo } from 'react';
import { parseISO } from 'date-fns';
import {
  CalendarEvent,
  EventStatus,
  findUnreportedOccurrences,
  getGoalContribution,
} from '../utils/eventUtils';
import { getWeekKey } from '../utils/dateUtils';
import { useCalendarEvents } from './useCalendarEvents';
import { useEventStatuses } from './useEventStatuses';
import { useWeeklyGoals } from './useWeeklyGoals';

/**
 * The unreported backlog and the two ways to clear it.
 *
 * Owns the goal bookkeeping rather than leaving it to callers, because the rule
 * that a report credits the occurrence's own week already lives in
 * CalendarScreen's handleStatusChange. Two copies of that rule would drift, and
 * the symptom — a count landing in the wrong week — is invisible until someone
 * checks last week's totals.
 */
export function useUnreported() {
  const { events } = useCalendarEvents();
  const { getStatus, setStatus, setStatuses } = useEventStatuses();
  const { adjustCountForWeek } = useWeeklyGoals();

  const unreported = useMemo(
    () => findUnreportedOccurrences(events, (id, dateStr) => getStatus(id, dateStr) !== undefined),
    [events, getStatus],
  );

  /**
   * Report a single occurrence.
   *
   * No previous-status reversal, unlike the calendar's toggle: everything in this
   * list is unreported by construction, so there is never an earlier count to
   * take back off.
   */
  const report = useCallback(
    async (occurrence: CalendarEvent, status: EventStatus) => {
      const contrib = getGoalContribution(occurrence);
      if (contrib && status === 'completed') {
        await adjustCountForWeek(contrib.goalId, getWeekKey(parseISO(occurrence.date)), contrib.delta);
      }
      await setStatus(occurrence.id, occurrence.date, status);
    },
    [adjustCountForWeek, setStatus],
  );

  /** Report the whole backlog at once. Returns how many occurrences were written. */
  const reportAll = useCallback(
    async (status: EventStatus): Promise<number> => {
      const batch = unreported;
      if (batch.length === 0) return 0;

      if (status === 'completed') {
        // Summed per week and goal before anything is written. Each adjustment is
        // a read-modify-write against one week's bucket, so applying them one
        // event at a time would be a storage round trip per event — all hitting
        // the same few buckets. Nested maps rather than a joined string key:
        // custom goal ids are user-supplied, so no separator character is safe.
        const totals = new Map<string, Map<string, number>>();
        for (const occurrence of batch) {
          const contrib = getGoalContribution(occurrence);
          if (!contrib) continue;
          const wk = getWeekKey(parseISO(occurrence.date));
          let byGoal = totals.get(wk);
          if (!byGoal) {
            byGoal = new Map();
            totals.set(wk, byGoal);
          }
          byGoal.set(contrib.goalId, (byGoal.get(contrib.goalId) ?? 0) + contrib.delta);
        }
        for (const [wk, byGoal] of totals) {
          for (const [goalId, delta] of byGoal) {
            await adjustCountForWeek(goalId, wk, delta);
          }
        }
      }

      await setStatuses(batch.map(o => ({ eventId: o.id, dateStr: o.date, status })));
      return batch.length;
    },
    [unreported, adjustCountForWeek, setStatuses],
  );

  return { unreported, count: unreported.length, report, reportAll };
}
