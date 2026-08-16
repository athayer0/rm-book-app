import { useCallback, useMemo } from 'react';
import { DEFAULT_EVENT_TYPES, EventTypeDefinition } from '../constants/eventTypeDefaults';
import { EVENT_TYPE_DEFINITIONS_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';
import { enqueueUpsert } from '../lib/syncQueue';
import { useAuth } from '../lib/AuthContext';

const EMPTY_DEFS: EventTypeDefinition[] = [];

/**
 * Restores every built-in type's `visible` flag from storage; label/icon/id
 * stay pinned to the shipped defaults since colour and duration already have
 * their own override system (settings.eventTypeColors / eventTypeDefaultMinutes).
 * Custom types pass through as-is, same shape as goal definitions' merge.
 */
function mergeWithDefaults(storedDefs: EventTypeDefinition[]): EventTypeDefinition[] {
  const builtIns = DEFAULT_EVENT_TYPES.map(def => {
    const stored = storedDefs.find(d => d.id === def.id);
    return stored ? { ...def, visible: stored.visible } : def;
  });
  const customs = storedDefs.filter(d => !d.builtIn);
  return [...builtIns, ...customs];
}

export function useEventTypeDefinitions() {
  const { user } = useAuth();
  const defsState = useStoredState<EventTypeDefinition[]>(EVENT_TYPE_DEFINITIONS_KEY, EMPTY_DEFS);

  const definitions = defsState.value.length > 0 ? mergeWithDefaults(defsState.value) : DEFAULT_EVENT_TYPES;

  const visibleDefinitions = useMemo(
    () => definitions.filter(d => d.visible),
    [definitions],
  );

  const byId = useMemo(
    () => Object.fromEntries(definitions.map(d => [d.id, d])) as Record<string, EventTypeDefinition>,
    [definitions],
  );

  const customLinks = useMemo(() => {
    const links: Record<string, { goalId: string; mode: 'count' | 'hours' }> = {};
    for (const def of definitions) {
      if (!def.builtIn && def.goalId) links[def.id] = { goalId: def.goalId, mode: def.goalMode ?? 'count' };
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

  const reload = useCallback(async () => {
    await defsState.reload();
  }, [defsState]);

  return { definitions, visibleDefinitions, byId, customLinks, updateDefinitions, reload };
}
