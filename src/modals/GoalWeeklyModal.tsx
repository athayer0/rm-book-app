import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Keyboard, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { useWeeklyGoals, resolveGoal } from '../hooks/useWeeklyGoals';
import { getWeekKeyByOffset, formatWeekLabel } from '../utils/dateUtils';
import { GoalGraphTab } from '../components/GoalGraphTab';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';

const MIN_OFFSET = -5;
const MAX_OFFSET = 3;

// Shared by the number pills and the divider so their glyphs centre on the same line.
const NUM_ROW_H = 36;

interface EditingField {
  id: string;
  field: 'actual' | 'goal';
  tempValue: string;
}

interface RowData {
  actual: number;
  // null on a future week whose goal hasn't been set yet.
  goal: number | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
}

export function GoalWeeklyModal({ visible, onClose, definitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { getWeekData, saveCountForWeek, saveGoalForWeek } = useWeeklyGoals();

  const [activeTab, setActiveTab] = useState<'graph' | 'goals'>('goals');
  const [weekOffset, setWeekOffset] = useState(0);
  const [rowData, setRowData] = useState<Record<string, RowData>>({});
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const visibleDefs = definitions.filter(d => d.visible);
  const weekKey = getWeekKeyByOffset(weekOffset);
  const isFuture = weekOffset > 0;
  const weekLabel = formatWeekLabel(weekKey);

  const loadWeek = useCallback(async (offset: number) => {
    const wk = getWeekKeyByOffset(offset);
    const { counts, goals } = await getWeekData(wk);
    const next: Record<string, RowData> = {};
    for (const def of definitions) {
      next[def.id] = {
        actual: counts[def.id] ?? 0,
        goal: resolveGoal(goals[def.id], offset > 0),
      };
    }
    setRowData(next);
  }, [definitions, getWeekData]);

  useEffect(() => {
    if (visible) {
      setActiveTab('goals');
      setWeekOffset(0);
      setEditingField(null);
      loadWeek(0);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      loadWeek(weekOffset);
    }
  }, [weekOffset]);

  function handlePrev() {
    if (weekOffset > MIN_OFFSET) setWeekOffset(o => o - 1);
  }

  function handleNext() {
    if (weekOffset < MAX_OFFSET) setWeekOffset(o => o + 1);
  }

  function openEdit(id: string, field: 'actual' | 'goal') {
    const current = rowData[id];
    if (!current) return;
    const value = field === 'actual' ? current.actual : current.goal;
    setEditingField({
      id,
      field,
      tempValue: value == null ? '' : String(value),
    });
  }

  async function confirmEdit() {
    if (!editingField) return;
    const { id, field, tempValue } = editingField;
    const parsed = parseInt(tempValue, 10);
    const value = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    setRowData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));

    if (field === 'actual') {
      await saveCountForWeek(id, weekKey, value);
    } else {
      await saveGoalForWeek(id, weekKey, value);
    }

    setEditingField(null);
  }

  // Steps the field without opening the keyboard; an empty box counts as 0.
  function stepValue(delta: number) {
    setEditingField(prev => {
      if (!prev) return prev;
      const parsed = parseInt(prev.tempValue, 10);
      const base = isNaN(parsed) ? 0 : parsed;
      return { ...prev, tempValue: String(Math.max(0, base + delta)) };
    });
  }

  const editingDef = editingField ? definitions.find(d => d.id === editingField.id) : null;

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weekly Planning</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.tabBar}>
          {(['graph', 'goals'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={styles.tabBtn}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                {tab === 'graph' ? 'Last 6 Weeks' : 'Goals'}
              </Text>
              {activeTab === tab && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'graph' && (
          <GoalGraphTab definitions={definitions} />
        )}

        {activeTab === 'goals' && <>

        <View style={styles.weekNav}>
          <View style={styles.weekLabelRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.weekLabelText}>{weekLabel}</Text>
          </View>
          <View style={styles.arrows}>
            <TouchableOpacity
              onPress={handlePrev}
              disabled={weekOffset <= MIN_OFFSET}
              style={[styles.arrowBtn, weekOffset <= MIN_OFFSET && styles.arrowDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={weekOffset <= MIN_OFFSET ? Colors.textLight : Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={weekOffset >= MAX_OFFSET}
              style={[styles.arrowBtn, weekOffset >= MAX_OFFSET && styles.arrowDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={20} color={weekOffset >= MAX_OFFSET ? Colors.textLight : Colors.text} />
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

                  {/* Grouped so the row's gap applies before the numbers, not between them. */}
                  <View style={styles.numGroup}>
                    {/* A future week has no actual to report yet — show the goal alone. */}
                    {!isFuture && (
                      <>
                        <TouchableOpacity
                          onPress={() => openEdit(def.id, 'actual')}
                          style={styles.numBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.numText}>
                            {row.actual}
                          </Text>
                        </TouchableOpacity>

                        <Text style={styles.divider}>/</Text>
                      </>
                    )}

                    <TouchableOpacity
                      onPress={() => openEdit(def.id, 'goal')}
                      style={row.goal === null ? styles.setGoalBtn : styles.numBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {row.goal === null ? (
                        <Text style={styles.setGoalText}>Set goals</Text>
                      ) : (
                        <Text style={styles.numText}>
                          {row.goal}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* The sheet itself stays put; only this dialog re-centres above the keyboard. */}
        {editingField && (
          <View style={[styles.editOverlay, { paddingBottom: keyboardHeight }]}>
            {/* Dismissing commits — there is no explicit Done. */}
            <TouchableOpacity style={styles.editOverlayBg} onPress={confirmEdit} activeOpacity={1} />
            <View style={styles.editSheet}>
                <Text style={styles.editTitle}>
                  {editingDef?.label ?? ''}
                </Text>
                <Text style={styles.editSubtitle}>
                  {editingField.field === 'actual' ? 'Actual achieved this week' : 'Weekly goal'}
                </Text>
                <View style={styles.stepperRow}>
                  <TextInput
                    style={styles.editInput}
                    value={editingField.tempValue}
                    onChangeText={v => setEditingField(prev => prev ? { ...prev, tempValue: v } : null)}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={4}
                  />

                  <View style={styles.stepperCol}>
                    <TouchableOpacity
                      onPress={() => stepValue(1)}
                      style={styles.stepBtn}
                      hitSlop={{ top: 4, bottom: 2, left: 8, right: 8 }}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => stepValue(-1)}
                      style={styles.stepBtn}
                      hitSlop={{ top: 2, bottom: 4, left: 8, right: 8 }}
                    >
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
            </View>
          </View>
        )}

        </>}
      </View>
    </SheetModal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: C.background },
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
    headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },
    closeBtn: { width: 44, alignItems: 'flex-start' },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      position: 'relative',
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: C.textSecondary,
    },
    tabLabelActive: {
      color: C.accent,
    },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 1,
      backgroundColor: C.accent,
    },
    weekNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    weekLabelRow: { flexDirection: 'row', alignItems: 'center' },
    weekLabelText: { fontSize: 15, fontWeight: '600', color: C.text },
    arrows: { flexDirection: 'row', gap: 4 },
    arrowBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowDisabled: { opacity: 0.35 },
    scroll: { flex: 1 },
    listContent: { paddingHorizontal: 12, paddingTop: 12 },
    goalCard: {
      backgroundColor: C.card,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
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
    numGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    numBtn: {
      minWidth: 28,
      height: NUM_ROW_H,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: C.background,
    },
    // Both share the pill's height as their line box, so the glyphs centre by the same
    // rule instead of each font size settling to its own metrics.
    numText: {
      fontSize: 26,
      fontWeight: '500',
      color: C.text,
      lineHeight: NUM_ROW_H,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    // Stands in for the goal on a future week with none set yet: plain text, no chrome.
    setGoalBtn: {
      height: 36,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    setGoalText: { fontSize: 15, fontWeight: '700', color: C.goalTextAction },
    divider: {
      fontSize: 33,
      fontWeight: '300',
      color: C.text,
      width: 15,
      textAlign: 'center',
      height: NUM_ROW_H,
      lineHeight: NUM_ROW_H,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    editOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    editOverlayBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    editSheet: {
      backgroundColor: C.card,
      borderRadius: 20,
      padding: 24,
      gap: 8,
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 8,
    },
    editTitle: { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    editSubtitle: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginBottom: 8 },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
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
      width: 88,
      borderWidth: 1.5,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 14,
      fontSize: 28,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
    },
  });
}
