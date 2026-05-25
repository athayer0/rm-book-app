import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { getIndicatorStorageKey, isNewWeek } from '../utils/dateUtils';
import { DEFAULT_INDICATORS, IndicatorDefinition } from '../constants/defaultIndicators';
import { enqueue } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type WeeklyCounts = Record<string, number>;

function mergeWithDefaults(storedDefs: IndicatorDefinition[]): IndicatorDefinition[] {
  // Built-ins are always the current DEFAULT_INDICATORS, preserving user-customized goals
  const builtIns = DEFAULT_INDICATORS.map(def => {
    const stored = storedDefs.find(d => d.id === def.id);
    return stored ? { ...def, goal: stored.goal } : def;
  });
  // Keep custom (non-builtIn) KIs from stored
  const customs = storedDefs.filter(d => !d.builtIn);
  return [...builtIns, ...customs];
}

export function useWeeklyIndicators() {
  const { user } = useAuth();
  const [definitions, setDefinitions] = useState<IndicatorDefinition[]>(DEFAULT_INDICATORS);
  const [counts, setCounts] = useState<WeeklyCounts>({});
  const weekKey = getIndicatorStorageKey();

  useEffect(() => {
    async function load() {
      const [storedDefs, storedCounts, lastReset] = await Promise.all([
        getItem<IndicatorDefinition[]>('indicator_definitions'),
        getItem<WeeklyCounts>(weekKey),
        getItem<string>('last_reset_date'),
      ]);

      if (storedDefs) {
        setDefinitions(mergeWithDefaults(storedDefs));
      }

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
    const [storedDefs, storedCounts] = await Promise.all([
      getItem<IndicatorDefinition[]>('indicator_definitions'),
      getItem<WeeklyCounts>(weekKey),
    ]);
    if (storedDefs) setDefinitions(mergeWithDefaults(storedDefs));
    setCounts(storedCounts ?? {});
  }, [weekKey]);

  const getCount = useCallback((id: string) => counts[id] ?? 0, [counts]);

  return { definitions, counts, increment, decrement, reset, resetAll, updateDefinitions, adjustCount, reload, getCount };
}
