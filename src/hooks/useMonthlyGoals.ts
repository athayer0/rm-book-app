import { useCallback, useMemo } from 'react';
import { getItem, setItem } from '../utils/storage';
import { getMonthKey, getMonthDates } from '../utils/dateUtils';
import { deriveWeekGoalCounts } from '../utils/eventUtils';
import {
  goalMonthlyCountsKey,
  goalMonthlyTargetsKey,
} from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { useCalendarEvents } from './useCalendarEvents';
import { useEventStatuses } from './useEventStatuses';
import { useEventTypeDefinitions } from './useEventTypeDefinitions';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type MonthlyCounts = Record<string, number>;
export type MonthlyGoals = Record<string, number>;

const EMPTY: Record<string, number> = {};

/**
 * Same shape as useWeeklyGoals, at month grain instead of week grain. There is
 * no separate set of "monthly goals" — goal definitions (label, icon, colour,
 * which grid it shows on) live in useWeeklyGoals/GOAL_DEFINITIONS_KEY only.
 * This hook owns just the counts and targets stored per month.
 */
function mergeCounts(derived: MonthlyCounts, offsets: MonthlyCounts): MonthlyCounts {
  const totals: MonthlyCounts = { ...derived };
  for (const [id, offset] of Object.entries(offsets)) {
    totals[id] = (totals[id] ?? 0) + offset;
  }
  for (const id of Object.keys(totals)) {
    if (totals[id] < 0) totals[id] = 0;
  }
  return totals;
}

export function useMonthlyGoals() {
  const { user } = useAuth();
  const monthKey = getMonthKey();
  const countsKey = goalMonthlyCountsKey(monthKey);
  const targetsKey = goalMonthlyTargetsKey(monthKey);

  const offsetsState = useStoredState<MonthlyCounts>(countsKey, EMPTY);
  const targetsState = useStoredState<MonthlyGoals>(targetsKey, EMPTY);

  const { events } = useCalendarEvents();
  const { getStatus } = useEventStatuses();
  const { customLinks } = useEventTypeDefinitions();

  const goals = targetsState.value;

  const isCompleted = useCallback(
    (eventId: string, dateStr: string) => getStatus(eventId, dateStr) === 'completed',
    [getStatus],
  );

  const derived = useMemo(
    () => deriveWeekGoalCounts(events, isCompleted, getMonthDates(monthKey), customLinks),
    [events, isCompleted, monthKey, customLinks],
  );

  const counts = useMemo(
    () => mergeCounts(derived, offsetsState.value),
    [derived, offsetsState.value],
  );

  const syncCount = useCallback(async (goalId: string, mk: string, count: number) => {
    if (!user) return;
    await enqueueUpsert('goal_monthly_entries', `${goalId}|${mk}|count`, {
      user_id: user.id, goal_id: goalId, month_key: mk, count,
    });
  }, [user]);

  const syncTarget = useCallback(async (goalId: string, mk: string, target: number) => {
    if (!user) return;
    await enqueueUpsert('goal_monthly_entries', `${goalId}|${mk}|target`, {
      user_id: user.id, goal_id: goalId, month_key: mk, target,
    });
  }, [user]);

  const reload = useCallback(async () => {
    await Promise.all([offsetsState.reload(), targetsState.reload()]);
  }, [offsetsState, targetsState]);

  const derivedFor = useCallback(
    (mk: string): MonthlyCounts =>
      mk === monthKey ? derived : deriveWeekGoalCounts(events, isCompleted, getMonthDates(mk), customLinks),
    [monthKey, derived, events, isCompleted, customLinks],
  );

  const getMonthData = useCallback(async (mk: string): Promise<{ counts: MonthlyCounts; goals: MonthlyGoals }> => {
    const [mkOffsets, mkGoals] = await Promise.all([
      getItem<MonthlyCounts>(goalMonthlyCountsKey(mk)),
      getItem<MonthlyGoals>(goalMonthlyTargetsKey(mk)),
    ]);
    return { counts: mergeCounts(derivedFor(mk), mkOffsets ?? {}), goals: mkGoals ?? {} };
  }, [derivedFor]);

  const saveCountForMonth = useCallback(async (id: string, mk: string, total: number) => {
    const offset = total - (derivedFor(mk)[id] ?? 0);
    if (mk === monthKey) {
      await offsetsState.write(current => ({ ...current, [id]: offset }));
    } else {
      const key = goalMonthlyCountsKey(mk);
      const stored = (await getItem<MonthlyCounts>(key)) ?? {};
      await setItem(key, { ...stored, [id]: offset });
    }
    await syncCount(id, mk, offset);
  }, [derivedFor, monthKey, offsetsState, syncCount]);

  const saveGoalForMonth = useCallback(async (id: string, mk: string, value: number) => {
    if (mk === monthKey) {
      await targetsState.write(current => ({ ...current, [id]: value }));
    } else {
      const key = goalMonthlyTargetsKey(mk);
      const stored = (await getItem<MonthlyGoals>(key)) ?? {};
      await setItem(key, { ...stored, [id]: value });
    }
    await syncTarget(id, mk, value);
  }, [targetsState, syncTarget, monthKey]);

  return { counts, goals, reload, getMonthData, saveCountForMonth, saveGoalForMonth };
}
