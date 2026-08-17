import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_GOALS, GoalDefinition, MAX_VISIBLE_GOALS } from '../constants/defaultGoals';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { EditGoalSheet, GoalDraft } from './EditGoalSheet';
import { useSettings } from '../hooks/useSettings';

/**
 * Which goal the edit sheet is open on: an existing one by id, or the
 * add-a-goal draft for one that doesn't exist yet. Mirrors the old
 * `ColorTarget` split, one level up — everything below this list now drills
 * into the sheet instead of expanding in place.
 */
type EditTarget = { kind: 'goal'; id: string } | { kind: 'new' };

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  onUpdateDefinitions: (defs: GoalDefinition[]) => Promise<void>;
  eventTypeDefs: EventTypeDefinition[];
  onUpdateEventTypeDefs: (defs: EventTypeDefinition[]) => Promise<void>;
}

export function WeeklyPlanningModal({
  visible, onClose, definitions, onUpdateDefinitions, eventTypeDefs, onUpdateEventTypeDefs,
}: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();

  const [localDefs, setLocalDefs] = useState<GoalDefinition[]>(definitions);
  // Mirrors localDefs, on the event-type side — only ever touched here to keep
  // a goal's link in step, since a link is stored on the type's own `goalId`.
  const [localEventTypeDefs, setLocalEventTypeDefs] = useState<EventTypeDefinition[]>(eventTypeDefs);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setLocalEventTypeDefs(eventTypeDefs);
      setEditTarget(null);
    }
  }, [visible]);

  // Edits are committed when the sheet closes — including an iOS swipe-down dismiss,
  // which fires onRequestClose for a pageSheet. onClose fires first so the sheet's
  // slide-out animation starts immediately rather than waiting on the definitions
  // write (an AsyncStorage save plus one sequential sync-queue enqueue per goal).
  function handleClose() {
    onClose();
    onUpdateDefinitions(localDefs);
    onUpdateEventTypeDefs(localEventTypeDefs);
  }

  const visibleCount = localDefs.filter(d => d.visible).length;
  const atVisibleLimit = visibleCount >= MAX_VISIBLE_GOALS;

  /** Whether a goal can be deleted right now — false while an event type still links to it. */
  function goalInUse(id: string): boolean {
    return localEventTypeDefs.some(d => d.goalId === id);
  }

  /** Tombstones rather than removes the array entry — see GoalDefinition.removed. */
  function deleteGoal(id: string): boolean {
    if (goalInUse(id)) return false;
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, removed: true } : d)));
    return true;
  }

  function patchGoal(id: string, patch: Partial<GoalDefinition>) {
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  // Un-hiding a built-in only goes through when there's room in the grid;
  // hiding one is always allowed since it only shrinks the count.
  function toggleVisible(def: GoalDefinition) {
    if (!def.visible && atVisibleLimit) return;
    patchGoal(def.id, { visible: !def.visible });
  }

  function saveEdit(draft: GoalDraft) {
    const { eventTypeId, ...goalPatch } = draft;
    if (editTarget?.kind === 'goal') {
      applyEventTypeLink(editTarget.id, eventTypeId);
      patchGoal(editTarget.id, goalPatch);
    } else if (editTarget?.kind === 'new') {
      if (atVisibleLimit) { setEditTarget(null); return; }
      const newId = `custom_${Date.now()}`;
      setLocalDefs(prev => [...prev, {
        id: newId,
        ...goalPatch,
        visible: true,
        monthlyVisible: false,
        builtIn: false,
      }]);
      applyEventTypeLink(newId, eventTypeId);
    }
    setEditTarget(null);
  }

  /**
   * Keeps a goal's link in step with the event-type side, where it's actually
   * stored. If the goal previously had a different type linked, that type is
   * freed; if a new type is picked, it's claimed.
   */
  function applyEventTypeLink(goalId: string, newTypeId: string | undefined) {
    setLocalEventTypeDefs(prev => prev.map(d => {
      if (d.goalId === goalId && d.id !== newTypeId) return { ...d, goalId: undefined, goalMode: undefined };
      if (d.id === newTypeId) return { ...d, goalId, goalMode: d.goalMode ?? 'count' };
      return d;
    }));
  }

  /** Types with no linked goal, plus whichever one currently links to this goal. */
  function availableEventTypesFor(goalId: string | undefined): EventTypeDefinition[] {
    return localEventTypeDefs.filter(t => !t.goalId || t.goalId === goalId);
  }

  // The sheet stays mounted through its own exit, so closing it (Cancel, Save,
  // or the backdrop) can't just null editTarget out from under it — that would
  // read as `kind: 'new'` for the last frames of a regular goal's close, and
  // the sheet would relabel itself "New Goal" while it slides away. Latching
  // the last non-null target keeps it pointed at whatever it was actually
  // editing until the next open overwrites it.
  const lastEditTarget = useRef<EditTarget | null>(null);
  if (editTarget) lastEditTarget.current = editTarget;
  const resolvedEditTarget = editTarget ?? lastEditTarget.current;
  const editingGoal = resolvedEditTarget?.kind === 'goal'
    ? localDefs.find(d => d.id === resolvedEditTarget.id)
    : undefined;

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Goals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.sectionLabel}>GOALS</Text>
        <View style={styles.goalList}>
        <View style={styles.goalListClip}>
          {localDefs.filter(d => !d.removed).map((def, index, arr) => {
            const isLast = index === arr.length - 1;
            return (
              <TouchableOpacity
                key={def.id}
                style={[styles.goalRow, isLast && styles.goalRowLast]}
                onPress={() => setEditTarget({ kind: 'goal', id: def.id })}
                activeOpacity={0.7}
              >
                <View style={[styles.goalIcon, { backgroundColor: isDark ? def.color : def.color + '20' }, !def.visible && styles.hiddenDim]}>
                  <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={20} color={isDark ? lightenColor(def.color) : def.color} />
                </View>
                <Text style={[styles.goalLabel, !def.visible && styles.hiddenDim]} numberOfLines={1}>
                  {def.label}
                </Text>

                {/* Delete now lives inside the edit sheet — every row's action is hide/show. */}
                <TouchableOpacity
                  onPress={() => toggleVisible(def)}
                  disabled={!def.visible && atVisibleLimit}
                  style={styles.rowAction}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={def.visible ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color={def.visible ? Colors.textSecondary : Colors.textLight}
                  />
                </TouchableOpacity>

                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            );
          })}
        </View>
        </View>

        <TouchableOpacity
          onPress={() => setEditTarget({ kind: 'new' })}
          disabled={atVisibleLimit}
          style={styles.addLink}
        >
          <Ionicons name="add" size={18} color={atVisibleLimit ? Colors.textLight : Colors.goalTextAction} />
          <Text style={[styles.addLinkText, atVisibleLimit && styles.addLinkTextDisabled]}>
            {atVisibleLimit ? `Maximum of ${MAX_VISIBLE_GOALS} goals shown at once` : 'Add a Goal'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* A Modal of its own, so it layers over this sheet rather than being
          clipped or fighting it for scroll space. */}
      <EditGoalSheet
        visible={editTarget !== null}
        goal={editingGoal}
        defaultColor={editingGoal?.builtIn ? DEFAULT_GOALS.find(g => g.id === editingGoal.id)?.color : undefined}
        availableEventTypes={availableEventTypesFor(editingGoal?.id)}
        eventTypeColors={settings.eventTypeColors}
        canDelete={editingGoal ? !goalInUse(editingGoal.id) : false}
        onCancel={() => setEditTarget(null)}
        onSave={saveEdit}
        onDelete={() => {
          if (!editingGoal) return;
          if (deleteGoal(editingGoal.id)) setEditTarget(null);
        }}
      />
    </SheetModal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    closeBtn: {
      width: 60,
      alignItems: 'flex-start',
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      padding: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    // Shadow only — kept off goalListClip because overflow:'hidden' clips a
    // shadow along with everything else, which on iOS erases it outright.
    goalList: {
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    goalListClip: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    goalRowLast: {
      borderBottomWidth: 0,
    },
    goalIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
    rowAction: {
      width: 28,
      alignItems: 'center',
    },
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20,
      paddingVertical: 10,
    },
    addLinkText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.goalTextAction,
    },
    addLinkTextDisabled: {
      color: C.textLight,
    },
    hiddenDim: {
      opacity: 0.4,
    },
  });
}
