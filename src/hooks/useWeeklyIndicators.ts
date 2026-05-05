import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '../utils/storage';
import { getIndicatorStorageKey, isNewWeek } from '../utils/dateUtils';
import { DEFAULT_INDICATORS, IndicatorDefinition } from '../constants/defaultIndicators';

export type WeeklyCounts = Record<string, number>;

export function useWeeklyIndicators() {
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

      if (storedDefs) setDefinitions(storedDefs);

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

  const increment = useCallback(async (id: string) => {
    const def = definitions.find(d => d.id === id);
    if (!def) return;
    const current = counts[id] ?? 0;
    const next = Math.min(current + 1, def.goal);
    const updated = { ...counts, [id]: next };
    setCounts(updated);
    await setItem(weekKey, updated);
  }, [counts, definitions, weekKey]);

  const reset = useCallback(async (id: string) => {
    const updated = { ...counts, [id]: 0 };
    setCounts(updated);
    await setItem(weekKey, updated);
  }, [counts, weekKey]);

  const resetAll = useCallback(async () => {
    setCounts({});
    await setItem(weekKey, {});
  }, [weekKey]);

  const updateDefinitions = useCallback(async (defs: IndicatorDefinition[]) => {
    setDefinitions(defs);
    await setItem('indicator_definitions', defs);
  }, []);

  const getCount = useCallback((id: string) => counts[id] ?? 0, [counts]);

  return { definitions, counts, increment, reset, resetAll, updateDefinitions, getCount };
}
