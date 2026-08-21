import { useCallback, useMemo, createContext, useContext } from 'react';
import {
  BUILTIN_GOAL_LINKS, BUILTIN_REPORT_STYLES, DEFAULT_EVENT_TYPES, EventTypeDefinition,
} from '../constants/eventTypeDefaults';
import type { CustomTypeLinks } from '../utils/eventUtils';
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
 *
 * The same "absent key falls back to the default" rule is why unlinking stores
 * `null` rather than `undefined`: a spread only overrides keys that are present,
 * and `undefined` doesn't survive the JSON round-trip to be present. See
 * EventTypeDefinition.goalId.
 */
function mergeWithDefaults(storedDefs: EventTypeDefinition[]): EventTypeDefinition[] {
  const builtIns = DEFAULT_EVENT_TYPES.map(def => {
    const stored = storedDefs.find(d => d.id === def.id);
    /**
     * The link is three fields but one decision, so it seeds or doesn't as a
     * unit. Field by field, a stored definition that had been relinked to a
     * single goal — written before a split was expressible, so carrying `goalId`
     * and nothing else — would keep its own goal for the early half and pick up
     * the shipped default's late half, turning a link the user chose into a pair
     * they never asked for. Prayer is the one type that can happen to, and the
     * one type anybody has relinked.
     */
    const seededLink = stored && 'goalId' in stored ? undefined : BUILTIN_GOAL_LINKS[def.id];
    const base = {
      ...def,
      reportStyle: BUILTIN_REPORT_STYLES[def.id] ?? 'none',
      // Spread whole: the table's keys are the definition's own field names, so
      // a seeded split pair (prayer) arrives with its cutoff attached.
      ...(seededLink ?? {}),
    };
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

type EventTypeDefinitionsContextValue = {
  definitions: EventTypeDefinition[];
  byId: Record<string, EventTypeDefinition>;
  customLinks: CustomTypeLinks;
  updateDefinitions: (defs: EventTypeDefinition[]) => Promise<void>;
  resetBuiltInDefinitions: () => Promise<void>;
  reload: () => Promise<void>;
};

// Same shape mergeWithDefaults(EMPTY_DEFS) would produce, so a consumer that
// somehow renders outside the provider still sees built-ins with their
// reportStyle/goal links intact rather than the bare, unreportable shape
// mergeWithDefaults only skips for defsState's own not-yet-loaded value.
const DEFAULT_DEFINITIONS = mergeWithDefaults(EMPTY_DEFS);
const DEFAULT_BY_ID = Object.fromEntries(DEFAULT_DEFINITIONS.map(d => [d.id, d]));

export const EventTypeDefinitionsContext = createContext<EventTypeDefinitionsContextValue>({
  definitions: DEFAULT_DEFINITIONS,
  byId: DEFAULT_BY_ID,
  customLinks: {},
  updateDefinitions: async () => {},
  resetBuiltInDefinitions: async () => {},
  reload: async () => {},
});

/**
 * The real implementation, held once by EventTypeDefinitionsProvider in
 * App.tsx. Every screen and every EventBlock reads the same already-loaded
 * value via useEventTypeDefinitions() below, rather than each mounting its
 * own useStoredState — a per-instance load meant a fresh EventBlock (every
 * one that a day swipe creates, since DayPager's fixed page slots re-key
 * their children on every date change) started from the empty defaults for
 * a beat, showing no status badge until its own storage read resolved.
 */
export function useEventTypeDefinitionsState(): EventTypeDefinitionsContextValue {
  const { user } = useAuth();
  const defsState = useStoredState<EventTypeDefinition[]>(EVENT_TYPE_DEFINITIONS_KEY, EMPTY_DEFS);

  // Sorted centrally, once, so every consumer (the type picker, quick-add list,
  // the Event Type dropdown, ...) reflects the Settings > Event Types > Reorder
  // order without sorting its own copy. Falls back to array position for
  // anything that somehow lacks `order` — defensive only, since DEFAULT_EVENT_TYPES
  // and every type-creation path populate it.
  const merged = defsState.value.length > 0 ? mergeWithDefaults(defsState.value) : DEFAULT_DEFINITIONS;
  const definitions = merged
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.order ?? a.i) - (b.d.order ?? b.i))
    .map(({ d }) => d);

  const byId = useMemo(
    () => Object.fromEntries(definitions.map(d => [d.id, d])) as Record<string, EventTypeDefinition>,
    [definitions],
  );

  // Covers every type with a link now, built-in or custom — getGoalContribution
  // has no per-type branch left at all, prayer's split included.
  //
  // Neither split field is defaulted here. `splitTime` is what marks a link as a
  // day/night pair, so supplying one a definition doesn't carry would invent a
  // split; and a pair whose evening goal isn't chosen yet passes a cutoff with no
  // `lateGoalId`, which getGoalContribution reads as "all of it counts early".
  const customLinks = useMemo(() => {
    const links: CustomTypeLinks = {};
    for (const def of definitions) {
      if (!def.goalId) continue;
      links[def.id] = {
        goalId: def.goalId,
        mode: def.goalMode ?? 'count',
        ...(def.goalSplitTime ? { splitTime: def.goalSplitTime } : {}),
        ...(def.lateGoalId ? { lateGoalId: def.lateGoalId } : {}),
      };
    }
    return links;
  }, [definitions]);

  const updateDefinitions = useCallback(async (defs: EventTypeDefinition[]) => {
    await defsState.write(() => defs);
    if (!user) return;
    for (const def of defs) {
      // `removed` must be sent explicitly, even when clearing it: an upsert only
      // updates columns present in the payload, and a restored built-in (spread
      // from DEFAULT_EVENT_TYPES, which never carries the key) would otherwise
      // omit `removed` entirely and leave the server's stale `true` in place forever.
      await enqueueUpsert('event_type_definitions', def.id, { ...def, removed: def.removed ?? false, user_id: user.id });
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

export function useEventTypeDefinitions(): EventTypeDefinitionsContextValue {
  return useContext(EventTypeDefinitionsContext);
}
