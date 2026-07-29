import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { isNewWeek, getWeekKey, getWeekKeyByOffset } from '../utils/dateUtils';
import { DEFAULT_GOALS, GoalDefinition } from '../constants/defaultGoals';
import {
  GOAL_DEFINITIONS_KEY,
  LAST_RESET_KEY,
  goalCountsKey,
  goalTargetsKey,
} from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type WeeklyCounts = Record<string, number>;
export type WeeklyGoals = Record<string, number>;

const EMPTY: Record<string, number> = {};
const EMPTY_DEFS: GoalDefinition[] = [];

// Each goal's weekly target is stored per week. A week at or before the current one treats
// an unset target as 0; a future week stays unset so the UI can prompt for one.
export function resolveGoal(stored: number | undefined, isFuture: boolean): number | null {
  return stored ?? (isFuture ? null : 0);
}

function mergeWithDefaults(storedDefs: GoalDefinition[]): GoalDefinition[] {
  const builtIns = DEFAULT_GOALS.map(def => {
    const stored = storedDefs.find(d => d.id === def.id);
    // Stored wins so renames, icons, colours and visibility persist; def supplies any
    // field added to the defaults since the user's copy was written.
    return stored ? { ...def, ...stored, builtIn: true } : def;
  });
  // Keep custom (non-builtIn) goals from stored
  const customs = storedDefs.filter(d => !d.builtIn);
  return [...builtIns, ...customs];
}

export function useWeeklyGoals() {
  const { user } = useAuth();
  // The bare week key is what the DB stores; the storage keys are derived from it.
  // Keeping them under separate names is what stops a storage key from being
  // written into the `week_key` column.
  const weekKey = getWeekKey();
  const countsKey = goalCountsKey(weekKey);
  const targetsKey = goalTargetsKey(weekKey);

  const defsState = useStoredState<GoalDefinition[]>(GOAL_DEFINITIONS_KEY, EMPTY_DEFS);
  const countsState = useStoredState<WeeklyCounts>(countsKey, EMPTY);
  const targetsState = useStoredState<WeeklyGoals>(targetsKey, EMPTY);

  const definitions = defsState.value.length > 0 ? mergeWithDefaults(defsState.value) : DEFAULT_GOALS;
  const counts = countsState.value;
  const goals = targetsState.value;

  const [resetChecked, setResetChecked] = useState(false);
  useEffect(() => {
    if (resetChecked) return;
    getItem<string>(LAST_RESET_KEY).then(async lastReset => {
      // Counts are keyed per week, so a rollover only needs the bookkeeping stamp;
      // the new week's key starts empty on its own.
      if (isNewWeek(lastReset)) await setItem(LAST_RESET_KEY, new Date().toISOString());
      setResetChecked(true);
    });
  }, [resetChecked]);

  const syncCount = useCallback(async (goalId: string, wk: string, count: number) => {
    if (!user) return;
    // Only the count column is sent — PostgREST builds the conflict update from
    // the keys present, so this cannot null out a target set for the same week.
    await enqueueUpsert('goal_entries', `${goalId}|${wk}|count`, {
      user_id: user.id, goal_id: goalId, week_key: wk, count,
    });
  }, [user]);

  const adjustBy = useCallback(async (id: string, delta: number, floorAtZero = true) => {
    const updated = await countsState.write(current => {
      const next = (current[id] ?? 0) + delta;
      return { ...current, [id]: floorAtZero ? Math.max(0, next) : next };
    });
    await syncCount(id, weekKey, updated[id]);
  }, [countsState, syncCount, weekKey]);

  const increment = useCallback((id: string) => adjustBy(id, 1), [adjustBy]);

  const decrement = useCallback(async (id: string) => {
    if ((countsState.current.current[id] ?? 0) <= 0) return;
    await adjustBy(id, -1);
  }, [countsState, adjustBy]);

  const reset = useCallback(async (id: string) => {
    await countsState.write(current => ({ ...current, [id]: 0 }));
    await syncCount(id, weekKey, 0);
  }, [countsState, syncCount, weekKey]);

  const resetAll = useCallback(async () => {
    await countsState.write(() => ({}));
    for (const def of definitions) await syncCount(def.id, weekKey, 0);
  }, [countsState, definitions, syncCount, weekKey]);

  const adjustCount = useCallback(async (id: string, delta: number) => {
    if (delta === 0) return;
    await adjustBy(id, delta);
  }, [adjustBy]);

  const updateDefinitions = useCallback(async (defs: GoalDefinition[]) => {
    await defsState.write(() => defs);
    if (!user) return;
    for (const def of defs) {
      await enqueueUpsert('goal_definitions', def.id, { ...def, user_id: user.id });
    }
  }, [defsState, user]);

  // Restore every built-in goal's fields (label, icon, colour, target, …) to the shipped
  // defaults. Custom goals are left untouched, and counts/targets live elsewhere so they persist.
  const resetBuiltInDefinitions = useCallback(async () => {
    const customs = definitions.filter(d => !d.builtIn);
    await updateDefinitions([...DEFAULT_GOALS.map(d => ({ ...d })), ...customs]);
  }, [definitions, updateDefinitions]);

  const reload = useCallback(async () => {
    await Promise.all([defsState.reload(), countsState.reload(), targetsState.reload()]);
  }, [defsState, countsState, targetsState]);

  const getCount = useCallback((id: string) => counts[id] ?? 0, [counts]);

  // ── Per-week data access ────────────────────────────────────────────────

  const getWeekData = useCallback(async (wk: string): Promise<{ counts: WeeklyCounts; goals: Record<string, number> }> => {
    const [wkCounts, wkGoals] = await Promise.all([
      getItem<WeeklyCounts>(goalCountsKey(wk)),
      getItem<Record<string, number>>(goalTargetsKey(wk)),
    ]);
    return { counts: wkCounts ?? {}, goals: wkGoals ?? {} };
  }, []);

  const saveCountForWeek = useCallback(async (id: string, wk: string, value: number) => {
    if (wk === getWeekKeyByOffset(0)) {
      await countsState.write(current => ({ ...current, [id]: value }));
    } else {
      const key = goalCountsKey(wk);
      const stored = (await getItem<WeeklyCounts>(key)) ?? {};
      await setItem(key, { ...stored, [id]: value });
    }
    await syncCount(id, wk, value);
  }, [countsState, syncCount]);

  const saveGoalForWeek = useCallback(async (id: string, wk: string, value: number) => {
    if (wk === getWeekKeyByOffset(0)) {
      await targetsState.write(current => ({ ...current, [id]: value }));
    } else {
      const key = goalTargetsKey(wk);
      const stored = (await getItem<WeeklyGoals>(key)) ?? {};
      await setItem(key, { ...stored, [id]: value });
    }
    if (!user) return;
    // Target-only, for the same reason syncCount is count-only.
    await enqueueUpsert('goal_entries', `${id}|${wk}|target`, {
      user_id: user.id, goal_id: id, week_key: wk, target: value,
    });
  }, [targetsState, user]);

  return { definitions, counts, goals, increment, decrement, reset, resetAll, updateDefinitions, resetBuiltInDefinitions, adjustCount, reload, getCount, getWeekData, saveCountForWeek, saveGoalForWeek };
}
