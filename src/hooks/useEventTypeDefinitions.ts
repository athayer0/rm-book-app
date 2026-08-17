import { useCallback, useMemo } from 'react';
import {
  BUILTIN_GOAL_LINKS, BUILTIN_REPORT_STYLES, DEFAULT_EVENT_TYPES, EventTypeDefinition,
} from '../constants/eventTypeDefaults';
import { EVENT_TYPE_DEFINITIONS_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

const EMPTY_DEFS: EventTypeDefinition[] = [];

/**
 * Merges a built-in's stored fields over its shipped default — same shape as
 * goal definitions' merge, so label/icon/goalId/goalMode all persist for
 * built-ins now that they're editable, not just `visible`. `BUILTIN_GOAL_LINKS`
 * seeds the pre-existing goal wiring (temple, church, ...) as each type's
 * default link, same as `def` supplies any other unset field.
 *
 * A removed type (built-in or custom) is a tombstone, not an absent row —
 * dropping it here is what stops a built-in from reappearing on the next
 * read, since `builtIns` below is always regenerated from DEFAULT_EVENT_TYPES.
 */
function mergeWithDefaults(storedDefs: EventTypeDefinition[]): EventTypeDefinition[] {
  const builtIns = DEFAULT_EVENT_TYPES.map(def => {
    const seededLink = BUILTIN_GOAL_LINKS[def.id];
    const base = {
      ...def,
      reportStyle: BUILTIN_REPORT_STYLES[def.id] ?? 'none',
      ...(seededLink ? { goalId: seededLink.goalId, goalMode: seededLink.goalMode } : {}),
    };
    const stored = storedDefs.find(d => d.id === def.id);
    return stored ? { ...base, ...stored, builtIn: true } : base;
  });
  // Predates reportStyle: every custom type was implicitly status-reportable
  // before this field existed, so a stored custom missing it defaults to
  // 'status' rather than 'none' — preserves behavior without a backfill.
  const customs = storedDefs
    .filter(d => !d.builtIn)
    .map(d => ({ ...d, reportStyle: d.reportStyle ?? 'status' }));
  return [...builtIns, ...customs].filter(d => !d.removed);
}

export function useEventTypeDefinitions() {
  const { user } = useAuth();
  const defsState = useStoredState<EventTypeDefinition[]>(EVENT_TYPE_DEFINITIONS_KEY, EMPTY_DEFS);

  const definitions = defsState.value.length > 0 ? mergeWithDefaults(defsState.value) : DEFAULT_EVENT_TYPES;

  const byId = useMemo(
    () => Object.fromEntries(definitions.map(d => [d.id, d])) as Record<string, EventTypeDefinition>,
    [definitions],
  );

  // Covers every type with a link now, built-in or custom — the built-in-only
  // hardcoded switch in getGoalContribution() is gone (except prayer's fallback).
  const customLinks = useMemo(() => {
    const links: Record<string, { goalId: string; mode: 'count' | 'hours' | 'quantity' }> = {};
    for (const def of definitions) {
      if (def.goalId) links[def.id] = { goalId: def.goalId, mode: def.goalMode ?? 'count' };
    }
    return links;
  }, [definitions]);

  const updateDefinitions = useCallback(async (defs: EventTypeDefinition[]) => {
    await defsState.write(() => defs);
    if (!user) return;
    for (const def of defs) {
      await enqueueUpsert('event_type_definitions', def.id, { ...def, user_id: user.id });
    }
  }, [defsState, user]);

  // Restore every built-in type's fields (label, icon, link, ...) to the shipped
  // defaults, including un-deleting one if it was removed. Custom types are left
  // untouched — mirrors useWeeklyGoals' resetBuiltInDefinitions.
  const resetBuiltInDefinitions = useCallback(async () => {
    const customs = definitions.filter(d => !d.builtIn);
    await updateDefinitions([...DEFAULT_EVENT_TYPES.map(d => ({ ...d })), ...customs]);
  }, [definitions, updateDefinitions]);

  const reload = useCallback(async () => {
    await defsState.reload();
  }, [defsState]);

  return { definitions, byId, customLinks, updateDefinitions, resetBuiltInDefinitions, reload };
}
