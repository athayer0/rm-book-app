import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { GoalGrid } from '../components/GoalGrid';
import { SectionHeader } from '../components/SectionHeader';
import { UnreportedRow } from '../components/UnreportedRow';
import { WeeklyPlanningModal } from '../modals/WeeklyPlanningModal';
import { GoalWeeklyModal } from '../modals/GoalWeeklyModal';
import { UnreportedEventsModal } from '../modals/UnreportedEventsModal';
import { useUnreported } from '../hooks/useUnreported';

export function HomeScreen({ navigation, route }: any) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { definitions, counts, goals, updateDefinitions, reload } = useWeeklyGoals();
  const { count: unreportedCount } = useUnreported();

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [editVisible, setEditVisible] = useState(false);
  const [planningVisible, setPlanningVisible] = useState(false);
  const [planningTab, setPlanningTab] = useState<'goals' | 'graph'>('goals');
  const [unreportedVisible, setUnreportedVisible] = useState(false);

  function openPlanning(tab: 'goals' | 'graph') {
    setPlanningTab(tab);
    setPlanningVisible(true);
  }

  // The daily-review notification tap navigates here with this param (set in
  // App.tsx, since the tap handler lives outside the tab tree and this modal's
  // open/close state does not). Consumed once and cleared, so returning to
  // this tab later doesn't reopen it.
  useEffect(() => {
    if (route?.params?.openUnreported) {
      setUnreportedVisible(true);
      navigation.setParams({ openUnreported: undefined });
    }
  }, [route?.params?.openUnreported]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <SectionHeader
            title="Weekly Goals"
            actionLabel="EDIT"
            onAction={() => setEditVisible(true)}
          />
          <GoalGrid
            definitions={definitions}
            counts={counts}
            goals={goals}
            onPressGoal={() => openPlanning('goals')}
          />
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => openPlanning('goals')}
              activeOpacity={0.75}
            >
              <Ionicons name="list-outline" size={17} color={Colors.control} />
              <Text style={styles.actionBtnText}>Goals</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => openPlanning('graph')}
              activeOpacity={0.75}
            >
              <Ionicons name="stats-chart-outline" size={17} color={Colors.control} />
              <Text style={styles.actionBtnText}>Last 6 Weeks</Text>
            </TouchableOpacity>
          </View>
        </View>

        <UnreportedRow count={unreportedCount} onPress={() => setUnreportedVisible(true)} />
      </ScrollView>

      <WeeklyPlanningModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        definitions={definitions}
        onUpdateDefinitions={updateDefinitions}
      />

      <GoalWeeklyModal
        visible={planningVisible}
        onClose={() => { setPlanningVisible(false); reload(); }}
        definitions={definitions}
        initialTab={planningTab}
      />

      <UnreportedEventsModal
        visible={unreportedVisible}
        onClose={() => { setUnreportedVisible(false); reload(); }}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: C.onPrimary,
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 28,
      gap: 16,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 16,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: C.contactActionBg,
    },
    actionBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.control,
    },
  });
}
