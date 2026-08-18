import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, useColorScheme,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useSettings } from '../hooks/useSettings';
import type { ColorPalette } from '../constants/colors';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useMonthlyGoals } from '../hooks/useMonthlyGoals';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { GoalGrid } from '../components/GoalGrid';
import { SectionHeader } from '../components/SectionHeader';
import { UnreportedRow } from '../components/UnreportedRow';
import { EditGoalsModal } from '../modals/EditGoalsModal';
import { GoalsModal } from '../modals/GoalsModal';
import { GoalGraphModal } from '../modals/GoalGraphModal';
import { UnreportedEventsModal } from '../modals/UnreportedEventsModal';
import { GoalGrain } from '../utils/goalGrain';
import { useUnreported } from '../hooks/useUnreported';

export function HomeScreen({ navigation, route }: any) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');

  const { definitions, counts, goals, updateDefinitions, reload } = useWeeklyGoals();
  const { counts: monthlyCounts, goals: monthlyGoals, reload: reloadMonthly } = useMonthlyGoals();
  const { count: unreportedCount } = useUnreported();
  const { definitions: eventTypeDefinitions, updateDefinitions: updateEventTypeDefinitions } = useEventTypeDefinitions();

  useFocusEffect(useCallback(() => { reload(); reloadMonthly(); }, [reload, reloadMonthly]));
  const [editVisible, setEditVisible] = useState(false);
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [graphVisible, setGraphVisible] = useState(false);
  // Which tab each sheet opens on. Tapping a grid opens that grid's own grain;
  // the buttons below both grids have no one grain to mean, so they open weekly.
  const [goalsGrain, setGoalsGrain] = useState<GoalGrain>('week');
  const [unreportedVisible, setUnreportedVisible] = useState(false);

  function openGoals(grain: GoalGrain) {
    setGoalsGrain(grain);
    setGoalsVisible(true);
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
        {/* Both grains in one card: they are two views of the same set of goal
            definitions, and the pair of sheets below serve both, so splitting
            them across two cards implied two independent features. EDIT sits on
            the first heading only — there is one goal editor for both grains. */}
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
            onPressGoal={() => openGoals('week')}
          />

          <SectionHeader title="Monthly Goals" tightTop />
          <GoalGrid
            definitions={definitions}
            counts={monthlyCounts}
            goals={monthlyGoals}
            onPressGoal={() => openGoals('month')}
            visibilityKey="monthlyVisible"
          />

          {/* Below both grids rather than under the weekly one, since each sheet
              covers both grains on its own tabs. */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, isDark && styles.actionBtnSwapped]}
              onPress={() => openGoals('week')}
              activeOpacity={0.75}
            >
              <Ionicons name="list-outline" size={17} color={isDark ? Colors.contactActionBg : Colors.control} />
              <Text style={[styles.actionBtnText, isDark && styles.actionBtnTextSwapped]}>Goals</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, isDark && styles.actionBtnSwapped]}
              onPress={() => setGraphVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="stats-chart-outline" size={17} color={isDark ? Colors.contactActionBg : Colors.control} />
              <Text style={[styles.actionBtnText, isDark && styles.actionBtnTextSwapped]}>Progress</Text>
            </TouchableOpacity>
          </View>
        </View>

        <UnreportedRow count={unreportedCount} onPress={() => setUnreportedVisible(true)} />
      </ScrollView>

      <EditGoalsModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        definitions={definitions}
        onUpdateDefinitions={updateDefinitions}
        eventTypeDefs={eventTypeDefinitions}
        onUpdateEventTypeDefs={updateEventTypeDefinitions}
      />

      {/* Reloads both grains on close: the sheet's tabs write either one, and
          which of them was touched isn't reported back. */}
      <GoalsModal
        visible={goalsVisible}
        onClose={() => { setGoalsVisible(false); reload(); reloadMonthly(); }}
        definitions={definitions}
        initialGrain={goalsGrain}
      />

      <GoalGraphModal
        visible={graphVisible}
        onClose={() => setGraphVisible(false)}
        definitions={definitions}
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
      // Asymmetric on purpose: the card sits closer under the maroon header than
      // it does above the tab bar. Both grids share one card now, so the content
      // is tall enough to fill the screen and these are the gaps you actually
      // see — the justifyContent above only centres a short page.
      paddingTop: 14,
      paddingBottom: 28,
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
    // 20 above the buttons, 16 below. The gap above is not paddingTop alone —
    // the grid already contributes its own 8 of bottom padding and a card's 4 of
    // margin, so paddingTop supplies only the remaining 8 of it.
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
    // Dark mode only: the button and its label swap which one carries `control`
    // vs `contactActionBg`, turning the outline-style button into a filled one.
    actionBtnSwapped: {
      backgroundColor: C.control,
    },
    actionBtnTextSwapped: {
      color: C.contactActionBg,
    },
  });
}
