import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Keyboard, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
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

  // ── Load week data ───────────────────────────────────────────────────────

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

  // ── Navigation ───────────────────────────────────────────────────────────

  function handlePrev() {
    if (weekOffset > MIN_OFFSET) setWeekOffset(o => o - 1);
  }

  function handleNext() {
    if (weekOffset < MAX_OFFSET) setWeekOffset(o => o + 1);
  }

  // ── Editing ──────────────────────────────────────────────────────────────

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

    // Update local rowData immediately
    setRowData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));

    // Persist
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

  // ── Render ───────────────────────────────────────────────────────────────

  const editingDef = editingField ? definitions.find(d => d.id === editingField.id) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weekly Planning</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Tab bar */}
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

        {/* Graph tab */}
        {activeTab === 'graph' && (
          <KIGraphTab definitions={definitions} />
        )}

        {/* Goals tab */}
        {activeTab === 'goals' && <>

        {/* Week Navigator */}
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

        {/* KI list */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.kiCard}>
            {visibleDefs.map((def, index) => {
              const row = rowData[def.id] ?? { actual: 0, goal: def.goal };
              const goalReached = row.actual >= row.goal;

              return (
                <View
                  key={def.id}
                  style={[styles.kiRow, index === visibleDefs.length - 1 && styles.kiRowLast]}
                >
                  {/* Icon */}
                  <View style={[styles.iconBadge, { backgroundColor: def.color + '20' }]}>
                    <KIIcon icon={def.icon} iconFamily={def.iconFamily} size={18} color={def.color} />
                  </View>

                  {/* Label */}
                  <Text style={styles.kiLabel} numberOfLines={2}>{def.label}</Text>

                  {/* Actual value */}
                  <TouchableOpacity
                    onPress={() => !isFuture && openEdit(def.id, 'actual')}
                    disabled={isFuture}
                    style={[styles.numBtn, isFuture && styles.numBtnDisabled]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[
                      styles.numText,
                      { color: isFuture ? Colors.textLight : (goalReached ? Colors.success : Colors.accent) },
                    ]}>
                      {row.actual}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.divider}>/</Text>

                  {/* Goal value */}
                  <TouchableOpacity
                    onPress={() => openEdit(def.id, 'goal')}
                    style={styles.numBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.numText, { color: Colors.textSecondary }]}>
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

        {/* Numeric edit overlay */}
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  closeBtn: { width: 44, alignItems: 'flex-start' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
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
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.accent,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.accent,
  },

  // Week navigator
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  weekLabelRow: { flexDirection: 'row', alignItems: 'center' },
  weekLabelText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  arrows: { flexDirection: 'row', gap: 4 },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.35 },

  // Column headers
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  colHeaderLabel: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.8, marginLeft: 46 },
  colHeaderNum: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, width: 36, textAlign: 'center' },
  colDivider: { width: 12, textAlign: 'center' },

  // List
  scroll: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  kiCard: {
    backgroundColor: Colors.card,
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
    borderBottomColor: Colors.border,
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
  kiLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },
  numBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  numBtnDisabled: { opacity: 0.45 },
  numText: { fontSize: 17, fontWeight: '700' },
  divider: { fontSize: 16, color: Colors.textLight, width: 12, textAlign: 'center' },

  futureNote: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 24,
    fontStyle: 'italic',
  },

  // Edit overlay
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  editOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  editSheet: {
    backgroundColor: Colors.card,
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
  editTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  editSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  editInput: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
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
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  editCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  editDoneBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  editDoneText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
