import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { IndicatorGrid } from '../components/IndicatorGrid';
import { SectionHeader } from '../components/SectionHeader';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { getPastWeekKeys, formatWeekLabel } from '../utils/dateUtils';
import { getItem } from '../utils/storage';
import { WeeklyCounts } from '../hooks/useWeeklyIndicators';

export function GoalsScreen() {
  const { definitions, counts, increment, decrement, updateDefinitions, reload } = useWeeklyIndicators();

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [editMode, setEditMode] = useState(false);
  const [pastData, setPastData] = useState<Record<string, WeeklyCounts>>({});
  const [pastLoaded, setPastLoaded] = useState(false);

  async function loadPastData() {
    if (pastLoaded) return;
    const keys = getPastWeekKeys(8);
    const data: Record<string, WeeklyCounts> = {};
    for (const key of keys) {
      const stored = await getItem<WeeklyCounts>(`indicators_${key}`);
      if (stored) data[key] = stored;
    }
    setPastData(data);
    setPastLoaded(true);
  }

  function handleGoalChange(id: string, goalStr: string) {
    const goal = parseInt(goalStr, 10);
    if (isNaN(goal) || goal < 0) return;
    const updated = definitions.map(d => d.id === id ? { ...d, goal } : d);
    updateDefinitions(updated);
  }

  function handleToggleVisible(id: string) {
    const def = definitions.find(d => d.id === id);
    if (def?.builtIn && def.visible) {
      const updated = definitions.map(d => d.id === id ? { ...d, visible: false } : d);
      updateDefinitions(updated);
    } else {
      const updated = definitions.map(d => d.id === id ? { ...d, visible: !d.visible } : d);
      updateDefinitions(updated);
    }
  }

  function handleDeleteCustom(id: string) {
    const def = definitions.find(d => d.id === id);
    if (def?.builtIn) return;
    Alert.alert('Delete Indicator', `Remove "${def?.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => updateDefinitions(definitions.filter(d => d.id !== id)),
      },
    ]);
  }

  function getWeekTotal(weekKey: string): number {
    const data = pastData[weekKey] ?? {};
    return Object.values(data).reduce((sum, v) => sum + (v as number), 0);
  }

  function getWeekMax(): number {
    return definitions.filter(d => d.visible).reduce((sum, d) => sum + d.goal, 0);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Goals</Text>
        <TouchableOpacity onPress={() => setEditMode(!editMode)} style={styles.editBtn}>
          <Ionicons name={editMode ? 'checkmark' : 'pencil'} size={20} color={Colors.white} />
          <Text style={styles.editText}>{editMode ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={loadPastData}
      >
        <View style={styles.card}>
          <SectionHeader title="This Week's Indicators" />

          {editMode ? (
            <View style={styles.editList}>
              {definitions.map(def => (
                <View key={def.id} style={styles.editRow}>
                  <TouchableOpacity onPress={() => handleToggleVisible(def.id)} style={styles.visibilityBtn}>
                    <Ionicons
                      name={def.visible ? 'eye' : 'eye-off'}
                      size={18}
                      color={def.visible ? Colors.accent : Colors.textLight}
                    />
                  </TouchableOpacity>
                  <View style={[styles.iconBadge, { backgroundColor: def.color + '20' }]}>
                    <Ionicons name={def.icon as any} size={16} color={def.color} />
                  </View>
                  <Text style={styles.editLabel} numberOfLines={1}>{def.label}</Text>
                  <Text style={styles.editGoalLabel}>Goal:</Text>
                  <TextInput
                    style={styles.goalInput}
                    value={String(def.goal)}
                    onChangeText={v => handleGoalChange(def.id, v)}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  {!def.builtIn && (
                    <TouchableOpacity onPress={() => handleDeleteCustom(def.id)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <IndicatorGrid
              definitions={definitions}
              counts={counts}
              onIncrement={increment}
              onDecrement={decrement}
            />
          )}
        </View>

        {/* Past Weeks */}
        <View style={styles.card}>
          <SectionHeader title="Past 8 Weeks" />
          <View style={styles.pastList}>
            {getPastWeekKeys(8).map((key, i) => {
              const total = getWeekTotal(key);
              const max = getWeekMax();
              const pct = max > 0 ? Math.min(total / max, 1) : 0;
              return (
                <View key={key} style={styles.pastRow}>
                  <Text style={styles.pastLabel}>{i === 0 ? 'This week' : formatWeekLabel(key)}</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? Colors.success : Colors.accent }]} />
                  </View>
                  <Text style={styles.pastCount}>{total}/{max}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  editText: { fontSize: 14, color: Colors.white, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { paddingTop: 12, paddingBottom: 20 },
  card: {
    backgroundColor: Colors.card,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  editList: { paddingHorizontal: 12, paddingBottom: 12 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  visibilityBtn: { padding: 4 },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '500' },
  editGoalLabel: { fontSize: 12, color: Colors.textSecondary },
  goalInput: {
    width: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.text,
  },
  deleteBtn: { padding: 4 },
  pastList: { padding: 16 },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  pastLabel: { width: 110, fontSize: 12, color: Colors.textSecondary },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  pastCount: { width: 50, fontSize: 12, color: Colors.textSecondary, textAlign: 'right' },
});
