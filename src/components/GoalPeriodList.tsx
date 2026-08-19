import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Keyboard, Platform, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition, MAX_GOAL_VALUE } from '../constants/defaultGoals';
import { resolveGoal } from '../hooks/useWeeklyGoals';
import {
  GoalGrain, GRAIN, MIN_OFFSET, MAX_OFFSET, PeriodDataReader, PeriodValueWriter, sortForGrain,
} from '../utils/goalGrain';
import { GoalIcon } from './GoalIcon';

// The number pill's line box, so the glyphs centre by this rule instead of
// the font size settling to its own metrics.
const NUM_ROW_H = 36;

// Same curves and timings as DropdownMenu and EventTypeSheet, so this dialog
// settles in with the same weight as every other popup in the app rather than
// reading as a different piece of software.
const DIALOG_OPEN_MS = 190;
const DIALOG_CLOSE_MS = 130;
const DIALOG_EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const DIALOG_EASE_IN = Easing.bezier(0.4, 0, 1, 1);

interface EditingRow {
  id: string;
  actualValue: string;
  goalValue: string;
  // False on a future period with no goal set yet — there's nothing achieved
  // against it to edit, so the dialog offers only the goal field.
  showActual: boolean;
}

interface RowData {
  actual: number;
  // null on a future period whose goal hasn't been set yet.
  goal: number | null;
}

interface Props {
  definitions: GoalDefinition[];
  grain: GoalGrain;
  /** The current period's counts and targets, already resolved by the owning hook. */
  counts: Record<string, number>;
  goals: Record<string, number>;
  getPeriodData: PeriodDataReader;
  saveCount: PeriodValueWriter;
  saveGoal: PeriodValueWriter;
  /** Lets the sheet freeze its header and tabs while the edit dialog is up. */
  onEditingChange?: (editing: boolean) => void;
}

/**
 * One grain's goal list: a period nav, a row per goal showing achieved-over-target,
 * and a dialog editing both numbers together. The weekly and monthly versions were
 * two 500-line files differing only in which hook they read and whether they said
 * "week" or "month", so they are this one component and the `GRAIN` table now.
 *
 * The owning sheet passes the data accessors in, since those come off a hook it
 * has to call — this component is deliberately storage-agnostic and works the
 * same at either grain.
 */
export function GoalPeriodList({
  definitions, grain, counts, goals, getPeriodData, saveCount, saveGoal, onEditingChange,
}: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { visibilityKey, keyByOffset, navLabel } = GRAIN[grain];

  const [offset, setOffset] = useState(0);
  const [rowData, setRowData] = useState<Record<string, RowData>>({});
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  // Drives the dialog's own fade/scale and the backdrop's fade together. Left
  // at 1 through the close animation — editingRow isn't cleared until that
  // animation's callback, so the dialog has its data to render for the whole
  // exit rather than blanking out mid-fade.
  const dialogAnim = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => { onEditingChange?.(editingRow !== null); }, [editingRow]);

  const visibleDefs = sortForGrain(definitions.filter(d => d[visibilityKey]), grain);
  const periodKey = keyByOffset(offset);
  const isFuture = offset > 0;

  // The current period's counts/goals are already resolved synchronously by the hook —
  // reading them directly (instead of round-tripping through getPeriodData's AsyncStorage
  // reads) is what stops a stale future period's row data from flashing on screen while
  // navigating back to the current one.
  const loadPeriod = useCallback(async (nextOffset: number) => {
    const { counts: pCounts, goals: pGoals } = nextOffset === 0
      ? { counts, goals }
      : await getPeriodData(keyByOffset(nextOffset));
    const next: Record<string, RowData> = {};
    for (const def of definitions) {
      next[def.id] = {
        actual: pCounts[def.id] ?? 0,
        goal: resolveGoal(pGoals[def.id], nextOffset > 0),
      };
    }
    setRowData(next);
  }, [definitions, getPeriodData, keyByOffset, counts, goals]);

  useEffect(() => { loadPeriod(offset); }, [offset, grain]);

  function handlePrev() {
    if (offset > MIN_OFFSET) setOffset(o => o - 1);
  }

  function handleNext() {
    if (offset < MAX_OFFSET) setOffset(o => o + 1);
  }

  function openEdit(id: string) {
    const current = rowData[id];
    if (!current) return;
    setEditingRow({
      id,
      actualValue: String(current.actual),
      goalValue: current.goal == null ? '' : String(current.goal),
      showActual: current.goal !== null,
    });
    dialogAnim.setValue(0);
    Animated.timing(dialogAnim, {
      toValue: 1, duration: DIALOG_OPEN_MS, easing: DIALOG_EASE_OUT, useNativeDriver: true,
    }).start();
  }

  // editingRow clears only once this finishes, so the dialog keeps rendering
  // its last values for the whole exit instead of blanking out mid-fade.
  function closeEdit() {
    Animated.timing(dialogAnim, {
      toValue: 0, duration: DIALOG_CLOSE_MS, easing: DIALOG_EASE_IN, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setEditingRow(null); });
  }

  async function confirmEdit() {
    if (!editingRow) return;
    const { id, actualValue, goalValue, showActual } = editingRow;
    const parsedGoal = parseInt(goalValue, 10);
    const goal = isNaN(parsedGoal) ? 0 : Math.min(MAX_GOAL_VALUE, Math.max(0, parsedGoal));

    // A future period's actual isn't part of this dialog, so its stored value
    // (always 0, nothing has happened yet) passes through untouched.
    const parsedActual = parseInt(actualValue, 10);
    const actual = showActual
      ? (isNaN(parsedActual) ? 0 : Math.min(MAX_GOAL_VALUE, Math.max(0, parsedActual)))
      : rowData[id]?.actual ?? 0;

    setRowData(prev => ({ ...prev, [id]: { actual, goal } }));

    if (showActual) await saveCount(id, periodKey, actual);
    await saveGoal(id, periodKey, goal);

    closeEdit();
  }

  // Steps a field without opening the keyboard; an empty box counts as 0.
  function stepValue(field: 'actual' | 'goal', delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingRow(prev => {
      if (!prev) return prev;
      const key = field === 'actual' ? 'actualValue' : 'goalValue';
      const parsed = parseInt(prev[key], 10);
      const base = isNaN(parsed) ? 0 : parsed;
      return { ...prev, [key]: String(Math.min(MAX_GOAL_VALUE, Math.max(0, base + delta))) };
    });
  }

  const editingDef = editingRow ? definitions.find(d => d.id === editingRow.id) : null;

  return (
    <View style={styles.flex}>
      <View style={styles.periodNav}>
        <View style={styles.periodLabelRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.accent} style={{ marginRight: 6 }} />
          <Text style={styles.periodLabelText}>{navLabel(periodKey)}</Text>
        </View>
        <View style={styles.arrows}>
          <TouchableOpacity
            onPress={handlePrev}
            disabled={offset <= MIN_OFFSET}
            style={[styles.arrowBtn, offset <= MIN_OFFSET && styles.arrowDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color={offset <= MIN_OFFSET ? Colors.textLight : Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            disabled={offset >= MAX_OFFSET}
            style={[styles.arrowBtn, offset >= MAX_OFFSET && styles.arrowDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={20} color={offset >= MAX_OFFSET ? Colors.textLight : Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {/* Split in two: shadow on the outer view, clipping on the inner one.
            The two can't share a view — overflow:hidden clips a shadow along
            with everything else, which on iOS erases it outright. */}
        <View style={styles.goalCardShadow}>
          <View style={styles.goalCard}>
            {visibleDefs.map((def, index) => {
              const row = rowData[def.id] ?? { actual: 0, goal: resolveGoal(undefined, isFuture) };

              return (
                <View
                  key={def.id}
                  style={[styles.kiRow, index === visibleDefs.length - 1 && styles.kiRowLast]}
                >
                  <View style={[styles.iconBadge, { backgroundColor: isDark ? def.color : def.color + '20' }]}>
                    <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={18} color={isDark ? lightenColor(def.color) : def.color} />
                  </View>

                  <Text style={styles.kiLabel} numberOfLines={2}>{def.label}</Text>

                  {/* A future period with no goal set yet has nothing to show a ratio
                      against — just the "Set goals" prompt. Once a goal exists, the
                      whole "actual/goal" reads as one tap target: it opens a single
                      dialog that edits both numbers together, so it's shown as one
                      pill rather than the two separately-tappable boxes it used to be. */}
                  {row.goal !== null ? (
                    <TouchableOpacity
                      onPress={() => openEdit(def.id)}
                      style={styles.numPill}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.numPillText}>
                        {row.actual}<Text style={styles.numPillSlash}> / </Text>{row.goal}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openEdit(def.id)}
                      style={styles.setGoalBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.setGoalText}>Set goals</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* The sheet itself stays put; only this dialog re-centres above the keyboard. */}
      {editingRow && (
        <View style={[styles.editOverlay, { paddingBottom: keyboardHeight }]}>
          {/* Dismissing commits both fields — there is no explicit Done. */}
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={confirmEdit} activeOpacity={1}>
            <Animated.View style={[styles.editOverlayBg, { opacity: dialogAnim }]} />
          </TouchableOpacity>
          <Animated.View
            style={[
              styles.editSheet,
              {
                opacity: dialogAnim,
                transform: [
                  { scale: dialogAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  { translateY: dialogAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                ],
              },
            ]}
          >
            <Text style={styles.editTitle}>{editingDef?.label ?? ''}</Text>

            <View style={styles.editFieldsRow}>
              {editingRow.showActual && (
                <View style={styles.editFieldRow}>
                  <Text style={styles.editFieldLabel}>Actual</Text>
                  <View style={styles.stepperRow}>
                    <TextInput
                      style={styles.editInput}
                      value={editingRow.actualValue}
                      onChangeText={v => setEditingRow(prev => prev ? { ...prev, actualValue: v } : null)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      maxLength={3}
                    />
                    <View style={styles.stepperCol}>
                      <TouchableOpacity
                        onPress={() => stepValue('actual', 1)}
                        style={styles.stepBtn}
                        hitSlop={{ top: 4, bottom: 2, left: 8, right: 8 }}
                      >
                        <Ionicons name="add" size={20} color={Colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => stepValue('actual', -1)}
                        style={styles.stepBtn}
                        hitSlop={{ top: 2, bottom: 4, left: 8, right: 8 }}
                      >
                        <Ionicons name="remove" size={20} color={Colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.editFieldRow}>
                <Text style={styles.editFieldLabel}>Goal</Text>
                <View style={styles.stepperRow}>
                  <TextInput
                    style={styles.editInput}
                    value={editingRow.goalValue}
                    onChangeText={v => setEditingRow(prev => prev ? { ...prev, goalValue: v } : null)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={3}
                  />
                  <View style={styles.stepperCol}>
                    <TouchableOpacity
                      onPress={() => stepValue('goal', 1)}
                      style={styles.stepBtn}
                      hitSlop={{ top: 4, bottom: 2, left: 8, right: 8 }}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => stepValue('goal', -1)}
                      style={styles.stepBtn}
                      hitSlop={{ top: 2, bottom: 4, left: 8, right: 8 }}
                    >
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: C.background },
    periodNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    periodLabelRow: { flexDirection: 'row', alignItems: 'center' },
    periodLabelText: { fontSize: 15, fontWeight: '600', color: C.text },
    arrows: { flexDirection: 'row', gap: 4 },
    arrowBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowDisabled: { opacity: 0.35 },
    scroll: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingTop: 16 },
    // Shadow only — kept off the clipped view below because overflow:'hidden'
    // clips a shadow along with everything else, which on iOS erases it outright.
    goalCardShadow: {
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    goalCard: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    kiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    kiRowLast: { borderBottomWidth: 0 },
    iconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    kiLabel: { flex: 1, fontSize: 17, fontWeight: '500', color: C.text },
    // One tap target for the whole "actual/goal" ratio, not two separately-
    // tappable boxes either side of a divider — a single pill is what says
    // "tap here" without implying the two numbers are separately editable.
    numPill: {
      height: NUM_ROW_H,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
    },
    numPillText: {
      fontSize: 22,
      fontWeight: '600',
      color: C.text,
      lineHeight: NUM_ROW_H,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    numPillSlash: {
      fontWeight: '300',
      color: C.textLight,
    },
    // Stands in for the goal on a future period with none set yet: plain text, no chrome.
    setGoalBtn: {
      height: 36,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    setGoalText: { fontSize: 15, fontWeight: '700', color: C.goalTextAction },
    editOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    editOverlayBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.modalBackdrop,
    },
    editSheet: {
      backgroundColor: C.card,
      borderRadius: 20,
      padding: 24,
      gap: 18,
      width: '100%',
      maxWidth: 380,
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 8,
    },
    editTitle: { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    // Side by side rather than stacked, so editing both numbers reads as one
    // dialog rather than two. A lone field (a future period's "Set goals") still
    // centres, since it's the only flex:1 child in the row.
    editFieldsRow: {
      flexDirection: 'row',
      gap: 16,
    },
    editFieldRow: { flex: 1, alignItems: 'center', gap: 8 },
    editFieldLabel: { fontSize: 13, fontWeight: '600', color: C.textSecondary, textAlign: 'center' },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    stepperCol: {
      gap: 6,
    },
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
    },
    editInput: {
      width: 76,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 6,
      paddingVertical: 12,
      fontSize: 24,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
    },
  });
}
