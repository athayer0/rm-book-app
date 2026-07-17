import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { getIndicatorStorageKey, isNewWeek, getWeekKeyByOffset, getWeekKey } from '../utils/dateUtils';
import { DEFAULT_INDICATORS, IndicatorDefinition } from '../constants/defaultIndicators';
import { enqueue } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type WeeklyCounts = Record<string, number>;
export type WeeklyGoals = Record<string, number>;

// Goals are stored per week. A week at or before the current one treats an unset goal
// as 0; a future week stays unset so the UI can prompt for one.
export function resolveGoal(stored: number | undefined, isFuture: boolean): number | null {
  return stored ?? (isFuture ? null : 0);
}

function goalsKeyFor(wk: string) {
  return `indicator_goals_${wk}`;
}

function mergeWithDefaults(storedDefs: IndicatorDefinition[]): IndicatorDefinition[] {
  const builtIns = DEFAULT_INDICATORS.map(def => {
    const stored = storedDefs.find(d => d.id === def.id);
    // Stored wins so renames, icons, colours and visibility persist; def supplies any
    // field added to the defaults since the user's copy was written.
    return stored ? { ...def, ...stored, builtIn: true } : def;
  });
  // Keep custom (non-builtIn) KIs from stored
  const customs = storedDefs.filter(d => !d.builtIn);
  return [...builtIns, ...customs];
}

export function useWeeklyIndicators() {
  const { user } = useAuth();
  const [definitions, setDefinitions] = useState<IndicatorDefinition[]>(DEFAULT_INDICATORS);
  const [counts, setCounts] = useState<WeeklyCounts>({});
  const [goals, setGoals] = useState<WeeklyGoals>({});
  const weekKey = getIndicatorStorageKey();
  const currentGoalsKey = goalsKeyFor(getWeekKey());

  useEffect(() => {
    async function load() {
      const [storedDefs, storedCounts, storedGoals, lastReset] = await Promise.all([
        getItem<IndicatorDefinition[]>('indicator_definitions'),
        getItem<WeeklyCounts>(weekKey),
        getItem<WeeklyGoals>(currentGoalsKey),
        getItem<string>('last_reset_date'),
      ]);

      if (storedDefs) {
        setDefinitions(mergeWithDefaults(storedDefs));
      }

      // Goals are keyed per week, so a new week starts empty without needing a reset.
      setGoals(storedGoals ?? {});

      if (isNewWeek(lastReset)) {
        setCounts({});
        await setItem(weekKey, {});
        await setItem('last_reset_date', new Date().toISOString());
      } else if (storedCounts) {
        setCounts(storedCounts);
      }
    }
    load();
  }, []);

  const syncEntry = useCallback(async (indicatorId: string, count: number) => {
    if (!user) return;
    await enqueue({
      table: 'indicator_entries',
      type: 'upsert',
      row: { user_id: user.id, indicator_id: indicatorId, week_key: weekKey, count, updated_at: new Date().toISOString() },
    });
  }, [user, weekKey]);

  const increment = useCallback(async (id: string) => {
    const current = counts[id] ?? 0;
    const next = current + 1;
    const updated = { ...counts, [id]: next };
    setCounts(updated);
    await setItem(weekKey, updated);
    await syncEntry(id, next);
  }, [counts, weekKey, syncEntry]);

  const decrement = useCallback(async (id: string) => {
    const current = counts[id] ?? 0;
    if (current <= 0) return;
    const next = current - 1;
    const updated = { ...counts, [id]: next };
    setCounts(updated);
    await setItem(weekKey, updated);
    await syncEntry(id, next);
  }, [counts, weekKey, syncEntry]);

  const reset = useCallback(async (id: string) => {
    const updated = { ...counts, [id]: 0 };
    setCounts(updated);
    await setItem(weekKey, updated);
    await syncEntry(id, 0);
  }, [counts, weekKey, syncEntry]);

  const resetAll = useCallback(async () => {
    setCounts({});
    await setItem(weekKey, {});
    for (const def of definitions) await syncEntry(def.id, 0);
  }, [weekKey, definitions, syncEntry]);

  const updateDefinitions = useCallback(async (defs: IndicatorDefinition[]) => {
    setDefinitions(defs);
    await setItem('indicator_definitions', defs);
    if (user) {
      for (const def of defs) {
        await enqueue({ table: 'indicator_definitions', type: 'upsert', row: { ...def, user_id: user.id, updated_at: new Date().toISOString() } });
      }
    }
  }, [user]);

  const adjustCount = useCallback(async (id: string, delta: number) => {
    if (delta === 0) return;
    const current = counts[id] ?? 0;
    const next = Math.max(0, current + delta);
    const updated = { ...counts, [id]: next };
    setCounts(updated);
    await setItem(weekKey, updated);
    await syncEntry(id, next);
  }, [counts, weekKey, syncEntry]);

  const reload = useCallback(async () => {
    const [storedDefs, storedCounts, storedGoals] = await Promise.all([
      getItem<IndicatorDefinition[]>('indicator_definitions'),
      getItem<WeeklyCounts>(weekKey),
      getItem<WeeklyGoals>(currentGoalsKey),
    ]);
    if (storedDefs) setDefinitions(mergeWithDefaults(storedDefs));
    setCounts(storedCounts ?? {});
    setGoals(storedGoals ?? {});
  }, [weekKey, currentGoalsKey]);

  const getCount = useCallback((id: string) => counts[id] ?? 0, [counts]);

  // ── Per-week data access ────────────────────────────────────────────────

  const getWeekData = useCallback(async (wk: string): Promise<{ counts: WeeklyCounts; goals: Record<string, number> }> => {
    const [wkCounts, wkGoals] = await Promise.all([
      getItem<WeeklyCounts>(`indicators_${wk}`),
      getItem<Record<string, number>>(`indicator_goals_${wk}`),
    ]);
    return { counts: wkCounts ?? {}, goals: wkGoals ?? {} };
  }, []);

  const saveCountForWeek = useCallback(async (id: string, wk: string, value: number) => {
    const stored = await getItem<WeeklyCounts>(`indicators_${wk}`) ?? {};
    const updated = { ...stored, [id]: value };
    await setItem(`indicators_${wk}`, updated);
    // If this is the current week, keep React state in sync
    if (wk === getWeekKeyByOffset(0)) {
      setCounts(updated);
    }
    if (user) {
      await enqueue({
        table: 'indicator_entries',
        type: 'upsert',
        row: { user_id: user.id, indicator_id: id, week_key: wk, count: value, updated_at: new Date().toISOString() },
      });
    }
  }, [user]);

  const saveGoalForWeek = useCallback(async (id: string, wk: string, value: number) => {
    const stored = await getItem<WeeklyGoals>(goalsKeyFor(wk)) ?? {};
    const updated = { ...stored, [id]: value };
    await setItem(goalsKeyFor(wk), updated);
    // If this is the current week, keep React state in sync
    if (wk === getWeekKeyByOffset(0)) {
      setGoals(updated);
    }
  }, []);

  return { definitions, counts, goals, increment, decrement, reset, resetAll, updateDefinitions, adjustCount, reload, getCount, getWeekData, saveCountForWeek, saveGoalForWeek };
}
