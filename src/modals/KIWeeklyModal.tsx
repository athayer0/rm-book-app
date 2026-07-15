import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Keyboard, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { getWeekKeyByOffset, formatWeekLabel } from '../utils/dateUtils';
import { KIGraphTab } from '../components/KIGraphTab';
import { KIIcon } from '../components/KIIcon';

const MIN_OFFSET = -5;
const MAX_OFFSET = 3;

interface EditingField {
  id: string;
  field: 'actual' | 'goal';
  tempValue: string;
}

interface RowData {
  actual: number;
  goal: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: IndicatorDefinition[];
}

export function KIWeeklyModal({ visible, onClose, definitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { getWeekData, saveCountForWeek, saveGoalForWeek } = useWeeklyIndicators();

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
        goal: goals[def.id] ?? def.goal,
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
    setEditingField({
      id,
      field,
      tempValue: String(field === 'actual' ? current.actual : current.goal),
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

  function cancelEdit() {
    setEditingField(null);
  }

  const editingDef = editingField ? definitions.find(d => d.id === editingField.id) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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
          <KIGraphTab definitions={definitions} />
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
              <Ionicons name="chevron-back" size={20} color={weekOffset <= MIN_OFFSET ? Colors.textLight : Colors.weekNavChevron} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={weekOffset >= MAX_OFFSET}
              style={[styles.arrowBtn, weekOffset >= MAX_OFFSET && styles.arrowDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={20} color={weekOffset >= MAX_OFFSET ? Colors.textLight : Colors.weekNavChevron} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.kiCard}>
            {visibleDefs.map((def, index) => {
              const row = rowData[def.id] ?? { actual: 0, goal: def.goal };

              return (
                <View
                  key={def.id}
                  style={[styles.kiRow, index === visibleDefs.length - 1 && styles.kiRowLast]}
                >
                  <View style={[styles.iconBadge, { backgroundColor: isDark ? def.color : def.color + '20' }]}>
                    <KIIcon icon={def.icon} iconFamily={def.iconFamily} size={18} color={isDark ? lightenColor(def.color) : def.color} />
                  </View>

                  <Text style={styles.kiLabel} numberOfLines={2}>{def.label}</Text>

                  <TouchableOpacity
                    onPress={() => !isFuture && openEdit(def.id, 'actual')}
                    disabled={isFuture}
                    style={[styles.numBtn, isFuture && styles.numBtnDisabled]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.numText, { color: Colors.kiNumberText }]}>
                      {row.actual}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.divider}>/</Text>

                  <TouchableOpacity
                    onPress={() => openEdit(def.id, 'goal')}
                    style={styles.numBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.numText, { color: Colors.kiNumberText }]}>
                      {row.goal}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {isFuture && (
            <Text style={styles.futureNote}>
              Goals only — actual values will be tracked once the week begins.
            </Text>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {editingField && (
          <View style={styles.editOverlay}>
            <TouchableOpacity style={styles.editOverlayBg} onPress={cancelEdit} activeOpacity={1} />
            <View style={[styles.editSheet, { marginBottom: keyboardHeight }]}>
                <Text style={styles.editTitle}>
                  {editingDef?.label ?? ''}
                </Text>
                <Text style={styles.editSubtitle}>
                  {editingField.field === 'actual' ? 'Actual achieved this week' : 'Weekly goal'}
                </Text>
                <TextInput
                  style={styles.editInput}
                  value={editingField.tempValue}
                  onChangeText={v => setEditingField(prev => prev ? { ...prev, tempValue: v } : null)}
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                  maxLength={4}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEdit} style={styles.editCancelBtn}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmEdit} style={styles.editDoneBtn}>
                    <Text style={styles.editDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
            </View>
          </View>
        )}

        </>}
      </View>
    </Modal>
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
    kiCard: {
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
    kiLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
    numBtn: {
      width: 26,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: C.background,
    },
    numBtnDisabled: { opacity: 0.45 },
    numText: { fontSize: 17, fontWeight: '700' },
    divider: { fontSize: 26, color: C.kiNumberText, width: 14, textAlign: 'center', marginHorizontal: -6 },
    futureNote: {
      fontSize: 12,
      color: C.textLight,
      textAlign: 'center',
      marginTop: 16,
      paddingHorizontal: 24,
      fontStyle: 'italic',
    },
    editOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    editOverlayBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    editSheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 8,
    },
    editTitle: { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    editSubtitle: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginBottom: 8 },
    editInput: {
      borderWidth: 1.5,
      borderColor: C.accent,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 28,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
    },
    editActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    editCancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: C.background,
      alignItems: 'center',
    },
    editCancelText: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
    editDoneBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: C.primary,
      alignItems: 'center',
    },
    editDoneText: { fontSize: 15, fontWeight: '700', color: C.white },
  });
}
