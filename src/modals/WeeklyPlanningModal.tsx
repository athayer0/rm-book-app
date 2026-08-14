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
import { GoalDefinition, MAX_VISIBLE_GOALS } from '../constants/defaultGoals';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { EditGoalSheet, GoalDraft } from './EditGoalSheet';

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
}

export function WeeklyPlanningModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [localDefs, setLocalDefs] = useState<GoalDefinition[]>(definitions);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setEditTarget(null);
    }
  }, [visible]);

  // Edits are committed when the sheet closes — including an iOS swipe-down dismiss,
  // which fires onRequestClose for a pageSheet.
  async function handleClose() {
    await onUpdateDefinitions(localDefs);
    onClose();
  }

  const visibleCount = localDefs.filter(d => d.visible).length;
  const atVisibleLimit = visibleCount >= MAX_VISIBLE_GOALS;

  function removeGoal(id: string) {
    setLocalDefs(prev => prev.filter(d => d.id !== id));
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
    if (editTarget?.kind === 'goal') {
      patchGoal(editTarget.id, draft);
    } else if (editTarget?.kind === 'new') {
      if (atVisibleLimit) { setEditTarget(null); return; }
      setLocalDefs(prev => [...prev, {
        id: `custom_${Date.now()}`,
        ...draft,
        visible: true,
        builtIn: false,
      }]);
    }
    setEditTarget(null);
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
          {localDefs.map((def, index) => {
            const isLast = index === localDefs.length - 1;
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

                {/* Built-ins hide rather than delete, keeping their counts and calendar
                    wiring intact. Custom goals have nothing to preserve, so they delete. */}
                {def.builtIn ? (
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
                ) : (
                  <TouchableOpacity
                    onPress={() => removeGoal(def.id)}
                    style={styles.rowAction}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                )}

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
        onCancel={() => setEditTarget(null)}
        onSave={saveEdit}
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
