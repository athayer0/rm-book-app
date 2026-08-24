import { useState, useEffect, useCallback, useMemo } from 'react';
import { getItem, setItem } from '../utils/storage';
import { isNewWeek, getWeekKey, getWeekDates } from '../utils/dateUtils';
import { deriveWeekGoalCounts } from '../utils/eventUtils';
import { DEFAULT_GOALS, GoalDefinition, MAX_GOAL_VALUE } from '../constants/defaultGoals';
import {
  GOAL_DEFINITIONS_KEY,
  LAST_RESET_KEY,
  goalCountsKey,
  goalTargetsKey,
} from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { useCalendarEvents } from './useCalendarEvents';
import { useEventStatuses } from './useEventStatuses';
import { useEventTypeDefinitions } from './useEventTypeDefinitions';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

export type WeeklyCounts = Record<string, number>;
export type WeeklyGoals = Record<string, number>;

const EMPTY: Record<string, number> = {};
const EMPTY_DEFS: GoalDefinition[] = [];

/**
 * A week's totals: what its completed events contribute, plus the user's manual
 * adjustment.
 *
 * The zero floor belongs on the total rather than on the stored offset — a
 * negative offset is exactly how "this week reads 0 even though two events are
 * checked off" is expressed.
 */
function mergeCounts(derived: WeeklyCounts, offsets: WeeklyCounts): WeeklyCounts {
  const totals: WeeklyCounts = { ...derived };
  for (const [id, offset] of Object.entries(offsets)) {
    totals[id] = (totals[id] ?? 0) + offset;
  }
  for (const id of Object.keys(totals)) {
    if (totals[id] < 0) totals[id] = 0;
  }
  return totals;
}

// Each goal's weekly target is stored per week. A past week treats an unset target
// as 0 — it's over, there's nothing left to prompt for. The current or a future
// week stays unset so the UI can prompt for one.
export function resolveGoal(stored: number | undefined, isPast: boolean): number | null {
  return stored ?? (isPast ? 0 : null);
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
  // A removed goal (built-in or custom) is a tombstone, not an absent row —
  // dropping it here rather than never storing it is what stops a built-in
  // from reappearing on the next read, since `builtIns` above is always
  // regenerated from the full DEFAULT_GOALS list.
  return [...builtIns, ...customs].filter(d => !d.removed);
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
  // Holds manual offsets, not totals. The event-driven share of every total is
  // derived below from events and statuses, which are the authority on it.
  const offsetsState = useStoredState<WeeklyCounts>(countsKey, EMPTY);
  const targetsState = useStoredState<WeeklyGoals>(targetsKey, EMPTY);

  const { events, loaded: eventsLoaded } = useCalendarEvents();
  const { getStatus, loaded: statusesLoaded } = useEventStatuses();
  const { customLinks, loaded: typeDefsLoaded } = useEventTypeDefinitions();

  const definitions = defsState.value.length > 0 ? mergeWithDefaults(defsState.value) : DEFAULT_GOALS;
  const goals = targetsState.value;

  const isCompleted = useCallback(
    (eventId: string, dateStr: string) => getStatus(eventId, dateStr) === 'completed',
    [getStatus],
  );

  const derived = useMemo(
    () => deriveWeekGoalCounts(events, isCompleted, getWeekDates(weekKey), customLinks),
    [events, isCompleted, weekKey, customLinks],
  );

  const counts = useMemo(
    () => mergeCounts(derived, offsetsState.value),
    [derived, offsetsState.value],
  );

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
    // `count` carries the manual offset, not the total: the total is recomputed on
    // each device from events and statuses, which sync as rows of their own. This
    // is also what makes concurrent edits survivable — two devices ticking the
    // same event converge instead of each replaying a +1.
    //
    // Only the count column is sent — PostgREST builds the conflict update from
    // the keys present, so this cannot null out a target set for the same week.
    await enqueueUpsert('goal_entries', `${goalId}|${wk}|count`, {
      user_id: user.id, goal_id: goalId, week_key: wk, count,
    });
  }, [user]);

  const syncTarget = useCallback(async (goalId: string, wk: string, target: number) => {
    if (!user) return;
    // Target-only, for the same reason syncCount is count-only.
    await enqueueUpsert('goal_entries', `${goalId}|${wk}|target`, {
      user_id: user.id, goal_id: goalId, week_key: wk, target,
    });
  }, [user]);

  /**
   * Force every goal to read zero for the current week, and clear the targets
   * set for it — a full reset back to "week not planned yet" rather than just
   * zeroing progress against whatever targets were left in place.
   *
   * Completed events cannot be un-completed from here, so zeroing means offsetting
   * their contribution: the offset is the negative of what the week derives. Goals
   * with nothing derived store no offset at all, which keeps the file free of
   * zero entries that would otherwise be indistinguishable from a real edit.
   */
  const resetAll = useCallback(async () => {
    const offsets: WeeklyCounts = {};
    for (const def of definitions) {
      const contributed = derived[def.id] ?? 0;
      if (contributed > 0) offsets[def.id] = -contributed;
    }
    await offsetsState.write(() => offsets);
    await targetsState.write(() => ({}));
    for (const def of definitions) {
      await syncCount(def.id, weekKey, offsets[def.id] ?? 0);
      await syncTarget(def.id, weekKey, 0);
    }
  }, [offsetsState, targetsState, definitions, derived, syncCount, syncTarget, weekKey]);

  const updateDefinitions = useCallback(async (defs: GoalDefinition[]) => {
    await defsState.write(() => defs);
    if (!user) return;
    for (const def of defs) {
      // `removed` must be sent explicitly, even when clearing it: an upsert only
      // updates columns present in the payload, and a restored built-in (spread
      // from DEFAULT_GOALS, which never carries the key) would otherwise omit
      // `removed` entirely and leave the server's stale `true` in place forever.
      await enqueueUpsert('goal_definitions', def.id, { ...def, removed: def.removed ?? false, user_id: user.id });
    }
  }, [defsState, user]);

  // Restore every built-in goal's fields (label, icon, colour, target, …) to the shipped
  // defaults. Custom goals are left untouched, and counts/targets live elsewhere so they persist.
  const resetBuiltInDefinitions = useCallback(async () => {
    const customs = definitions.filter(d => !d.builtIn);
    await updateDefinitions([...DEFAULT_GOALS.map(d => ({ ...d })), ...customs]);
  }, [definitions, updateDefinitions]);

  const reload = useCallback(async () => {
    await Promise.all([defsState.reload(), offsetsState.reload(), targetsState.reload()]);
  }, [defsState, offsetsState, targetsState]);

  // ── Per-week data access ────────────────────────────────────────────────

  /** Derive any week's contributions. The current week is already memoised above. */
  const derivedFor = useCallback(
    (wk: string): WeeklyCounts =>
      wk === weekKey ? derived : deriveWeekGoalCounts(events, isCompleted, getWeekDates(wk), customLinks),
    [weekKey, derived, events, isCompleted, customLinks],
  );

  const getWeekData = useCallback(async (wk: string): Promise<{ counts: WeeklyCounts; goals: Record<string, number> }> => {
    const [wkOffsets, wkGoals] = await Promise.all([
      getItem<WeeklyCounts>(goalCountsKey(wk)),
      getItem<Record<string, number>>(goalTargetsKey(wk)),
    ]);
    return { counts: mergeCounts(derivedFor(wk), wkOffsets ?? {}), goals: wkGoals ?? {} };
  }, [derivedFor]);

  /**
   * Set a goal's displayed total for a week.
   *
   * Stored as the difference from what that week's events already contribute, so
   * the number typed is the number shown — and so ticking an event off afterwards
   * moves the total without discarding the adjustment. The offset may be negative;
   * only the total is floored.
   */
  const saveCountForWeek = useCallback(async (id: string, wk: string, total: number) => {
    const offset = Math.min(MAX_GOAL_VALUE, Math.max(0, total)) - (derivedFor(wk)[id] ?? 0);
    if (wk === weekKey) {
      await offsetsState.write(current => ({ ...current, [id]: offset }));
    } else {
      const key = goalCountsKey(wk);
      const stored = (await getItem<WeeklyCounts>(key)) ?? {};
      await setItem(key, { ...stored, [id]: offset });
    }
    await syncCount(id, wk, offset);
  }, [derivedFor, weekKey, offsetsState, syncCount]);

  const saveGoalForWeek = useCallback(async (id: string, wk: string, rawValue: number) => {
    const value = Math.min(MAX_GOAL_VALUE, Math.max(0, rawValue));
    if (wk === weekKey) {
      await targetsState.write(current => ({ ...current, [id]: value }));
    } else {
      const key = goalTargetsKey(wk);
      const stored = (await getItem<WeeklyGoals>(key)) ?? {};
      await setItem(key, { ...stored, [id]: value });
    }
    await syncTarget(id, wk, value);
  }, [targetsState, syncTarget, weekKey]);

  // Everything `counts`/`definitions`/`goals` are derived from — a screen
  // gating its render on this can trust the numbers it shows the instant it
  // stops being true, rather than the first (wrong) values these compute to
  // off each hook's still-empty initial state.
  const loaded = defsState.loaded && offsetsState.loaded && targetsState.loaded
    && eventsLoaded && statusesLoaded && typeDefsLoaded;

  return { definitions, counts, goals, resetAll, updateDefinitions, resetBuiltInDefinitions, reload, getWeekData, saveCountForWeek, saveGoalForWeek, loaded };
}
