import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalDefinition } from '../constants/defaultGoals';
import { SheetModal } from '../components/SheetModal';
import { EditEventTypeSheet, EventTypeDraft } from './EditEventTypeSheet';
import { useSettings } from '../hooks/useSettings';
import { eventTypeColor, eventTypeDefaultMinutes } from '../utils/eventUtils';

/**
 * Which type the edit sheet is open on: an existing one by id, or the
 * add-a-type draft for one that doesn't exist yet. Mirrors WeeklyPlanningModal's
 * EditTarget split.
 */
type EditTarget = { kind: 'type'; id: string } | { kind: 'new' };

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: EventTypeDefinition[];
  onUpdateDefinitions: (defs: EventTypeDefinition[]) => Promise<void>;
  /** For the goal-link picker's candidate list — passed down from useWeeklyGoals(). */
  goalDefinitions: GoalDefinition[];
}

export function EventTypesModal({ visible, onClose, definitions, onUpdateDefinitions, goalDefinitions }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings, updateSettings } = useSettings();

  const [localDefs, setLocalDefs] = useState<EventTypeDefinition[]>(definitions);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setEditTarget(null);
    }
  }, [visible]);

  // Edits are committed when the sheet closes — same reasoning as
  // WeeklyPlanningModal: onClose fires first so the slide-out starts
  // immediately rather than waiting on the definitions write.
  function handleClose() {
    onClose();
    onUpdateDefinitions(localDefs);
  }

  function removeType(id: string) {
    setLocalDefs(prev => prev.filter(d => d.id !== id));
  }

  function patchType(id: string, patch: Partial<EventTypeDefinition>) {
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  // Built-ins hide/unhide freely — these render in scrollable lists and menus,
  // not a fixed grid, so there's no MAX_VISIBLE_GOALS-style cap to enforce.
  function toggleVisible(def: EventTypeDefinition) {
    patchType(def.id, { visible: !def.visible });
  }

  // A custom goal/type can have at most one link. The picker only offers goals
  // with no existing link, plus whichever one is currently linked to the type
  // being edited.
  function availableGoalsFor(typeId: string | undefined): GoalDefinition[] {
    const linkedGoalIds = new Set(
      localDefs.filter(d => !d.builtIn && d.goalId && d.id !== typeId).map(d => d.goalId!),
    );
    return goalDefinitions.filter(g => !g.builtIn && !linkedGoalIds.has(g.id));
  }

  function saveEdit(draft: EventTypeDraft) {
    if (editTarget?.kind === 'type') {
      const id = editTarget.id;
      const existing = localDefs.find(d => d.id === id);
      if (!existing) { setEditTarget(null); return; }
      if (!existing.builtIn) {
        patchType(id, {
          label: draft.label, icon: draft.icon, iconFamily: draft.iconFamily,
          goalId: draft.goalId, goalMode: draft.goalMode,
        });
      }
      applyOverrides(id, draft);
    } else if (editTarget?.kind === 'new') {
      const id = `custom_evt_${Date.now()}`;
      setLocalDefs(prev => [...prev, {
        id, label: draft.label, icon: draft.icon, iconFamily: draft.iconFamily,
        visible: true, builtIn: false, goalId: draft.goalId, goalMode: draft.goalMode,
      }]);
      applyOverrides(id, draft);
    }
    setEditTarget(null);
  }

  // Color and default duration live in settings, not on the definition — same
  // maps EventColorsModal/EventDurationsModal read/write.
  function applyOverrides(id: string, draft: EventTypeDraft) {
    // A checkbox or optional-end built-in (task, contact) has no duration to
    // set — the sheet hides that field for them, so don't write a stray
    // override that eventTypeDefaultMinutes() would never read back anyway.
    const nextMinutes = { ...settings.eventTypeDefaultMinutes };
    if (eventTypeDefaultMinutes(id, {}) !== null) nextMinutes[id] = draft.defaultMinutes;
    updateSettings({
      eventTypeColors: { ...settings.eventTypeColors, [id]: draft.color },
      eventTypeDefaultMinutes: nextMinutes,
    });
  }

  // Same latch as WeeklyPlanningModal — keeps the sheet pointed at whatever it
  // was actually editing while it slides out, rather than relabeling itself
  // "New Event Type" for the last frames of a regular type's close.
  const lastEditTarget = useRef<EditTarget | null>(null);
  if (editTarget) lastEditTarget.current = editTarget;
  const resolvedEditTarget = editTarget ?? lastEditTarget.current;
  const editingType = resolvedEditTarget?.kind === 'type'
    ? localDefs.find(d => d.id === resolvedEditTarget.id)
    : undefined;

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Types</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.list}>
        <View style={styles.listClip}>
          {localDefs.map((def, index) => {
            const isLast = index === localDefs.length - 1;
            const color = eventTypeColor(def.id, settings.eventTypeColors);
            return (
              <TouchableOpacity
                key={def.id}
                style={[styles.row, isLast && styles.rowLast]}
                onPress={() => setEditTarget({ kind: 'type', id: def.id })}
                activeOpacity={0.7}
              >
                <View style={[styles.dot, { backgroundColor: color }, !def.visible && styles.hiddenDim]} />
                <Text style={[styles.label, !def.visible && styles.hiddenDim]} numberOfLines={1}>
                  {def.label}
                </Text>

                {/* Built-ins hide rather than delete, keeping their calendar
                    wiring intact. Custom types have nothing to preserve. */}
                {def.builtIn ? (
                  <TouchableOpacity
                    onPress={() => toggleVisible(def)}
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
                    onPress={() => removeType(def.id)}
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

        <TouchableOpacity onPress={() => setEditTarget({ kind: 'new' })} style={styles.addLink}>
          <Ionicons name="add" size={18} color={Colors.goalTextAction} />
          <Text style={styles.addLinkText}>Add an Event Type</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <EditEventTypeSheet
        visible={editTarget !== null}
        eventType={editingType}
        color={editingType ? eventTypeColor(editingType.id, settings.eventTypeColors) : undefined}
        defaultMinutes={editingType ? eventTypeDefaultMinutes(editingType.id, settings.eventTypeDefaultMinutes) ?? undefined : undefined}
        defaultColor={editingType?.builtIn ? EventColors[editingType.id] : undefined}
        availableGoals={availableGoalsFor(editingType?.id)}
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
    closeBtn: { width: 44, alignItems: 'flex-start' },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    list: {
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    listClip: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    dot: { width: 14, height: 14, borderRadius: 7 },
    label: {
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
    hiddenDim: {
      opacity: 0.4,
    },
  });
}
