import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import { useSettings } from '../hooks/useSettings';
import type { ColorPalette } from '../constants/colors';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useMonthlyGoals } from '../hooks/useMonthlyGoals';
import { GoalGrid } from '../components/GoalGrid';
import { SectionHeader } from '../components/SectionHeader';
import { UnreportedRow } from '../components/UnreportedRow';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { GoalsModal } from '../modals/GoalsModal';
import { GoalGraphModal } from '../modals/GoalGraphModal';
import { UnreportedEventsModal } from '../modals/UnreportedEventsModal';
import { GoalGrain, GRAIN } from '../utils/goalGrain';
import { useUnreported } from '../hooks/useUnreported';
import { useOnboardingFinishing } from '../hooks/useOnboarding';
import { HEADER_HEIGHT } from '../constants/layout';
import { getWeekKey, getMonthKey } from '../utils/dateUtils';
import { MAX_GOAL_VALUE } from '../constants/defaultGoals';

export function HomeScreen({ navigation, route }: any) {
  const Colors = useColors();
  // useSafeAreaInsets() reads the already-resolved value from SafeAreaProvider's
  // JS context immediately on mount. The <SafeAreaView> *component* instead does
  // its own independent native measurement on every mount, which lags a frame or
  // two behind — that's what was showing as the header growing taller right after
  // opening a tab. See HomeLoadingScreen for the same pattern.
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');

  const { definitions, allDefinitions, counts, goals, updateDefinitions, reload, saveCountForWeek, loaded: weeklyLoaded } = useWeeklyGoals();
  const { counts: monthlyCounts, goals: monthlyGoals, reload: reloadMonthly, saveCountForMonth, loaded: monthlyLoaded } = useMonthlyGoals();
  const { count: unreportedCount, loaded: unreportedLoaded } = useUnreported();
  const onboardingFinishing = useOnboardingFinishing();
  // Covers the same gap onboardingFinishing does (see HomeSkeleton) but for a
  // plain first mount: each hook's own useStoredState only starts its
  // AsyncStorage read once this screen mounts, so for a beat after sign-in or
  // an app restart, counts/goals/unreportedCount all sit at their empty
  // initial values — real zeros, not "not loaded yet" — and would otherwise
  // render as a confidently wrong 0/0 before the real numbers pop in.
  const dataLoaded = weeklyLoaded && monthlyLoaded && unreportedLoaded;

  useFocusEffect(useCallback(() => { reload(); reloadMonthly(); }, [reload, reloadMonthly]));
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [graphVisible, setGraphVisible] = useState(false);
  // Which tab each sheet opens on. Tapping a grid opens that grid's own grain;
  // the buttons below both grids have no one grain to mean, so they open weekly.
  const [goalsGrain, setGoalsGrain] = useState<GoalGrain>('week');
  // Which goal GoalsModal opens its edit dialog on — set when an unset card is
  // tapped, cleared for every other way of opening the sheet so a stale value
  // never auto-opens a dialog the tap that got you there didn't ask for.
  const [goalsEditGoalId, setGoalsEditGoalId] = useState<string | null>(null);
  const [unreportedVisible, setUnreportedVisible] = useState(false);

  // Tap-to-order goal reorder: Settings' Goal Types > Reorder row navigates
  // here and starts this (see the startGoalReorder param effect below) rather
  // than reordering in place there, since weekly/monthly are grids here, not
  // a flat list. Each grain gets its own tap sequence — a goal shown on both
  // grids gets numbered independently in each — and nothing is written until
  // both sequences are complete and Done (the same button as Cancel, once
  // every visible card in both grids is tapped) is pressed.
  const [reorderActive, setReorderActive] = useState(false);
  const [weekTaps, setWeekTaps] = useState<string[]>([]);
  const [monthTaps, setMonthTaps] = useState<string[]>([]);

  function openGoals(grain: GoalGrain) {
    setGoalsGrain(grain);
    setGoalsEditGoalId(null);
    setGoalsVisible(true);
  }

  // Opens GoalsModal scoped to one goal's set-target dialog, rather than the
  // plain period list openGoals leads to. Reached two ways: a long-press on
  // any card, or a plain tap on a card with no target set yet (there's
  // nothing to step against an unset target, so the tap goes here rather
  // than to incrementWeekGoal/incrementMonthGoal below). A plain tap on a set
  // card instead steps the count by one.
  function openGoalTarget(grain: GoalGrain, id: string) {
    setGoalsGrain(grain);
    setGoalsEditGoalId(id);
    setGoalsVisible(true);
  }

  function incrementWeekGoal(id: string) {
    const total = Math.min(MAX_GOAL_VALUE, (counts[id] ?? 0) + 1);
    saveCountForWeek(id, getWeekKey(), total);
  }

  function decrementWeekGoal(id: string) {
    const total = Math.max(0, (counts[id] ?? 0) - 1);
    saveCountForWeek(id, getWeekKey(), total);
  }

  function incrementMonthGoal(id: string) {
    const total = Math.min(MAX_GOAL_VALUE, (monthlyCounts[id] ?? 0) + 1);
    saveCountForMonth(id, getMonthKey(), total);
  }

  function decrementMonthGoal(id: string) {
    const total = Math.max(0, (monthlyCounts[id] ?? 0) - 1);
    saveCountForMonth(id, getMonthKey(), total);
  }

  function startGoalReorder() {
    setWeekTaps([]);
    setMonthTaps([]);
    setReorderActive(true);
  }

  function tapWeekGoal(id: string) {
    setWeekTaps(prev => (prev.includes(id) ? prev : [...prev, id]));
  }

  function tapMonthGoal(id: string) {
    setMonthTaps(prev => (prev.includes(id) ? prev : [...prev, id]));
  }

  const weekVisibleCount = definitions.filter(d => d.visible).length;
  const monthVisibleCount = definitions.filter(d => d.monthlyVisible).length;
  const reorderComplete = weekTaps.length === weekVisibleCount && monthTaps.length === monthVisibleCount;

  function commitGoalReorder() {
    // allDefinitions, not definitions — a removed goal's tombstone must
    // round-trip through this write too, or it disappears from storage and
    // reappears (built-ins regenerate from DEFAULT_GOALS) on the next read.
    const patched = allDefinitions.map(d => {
      const wIdx = weekTaps.indexOf(d.id);
      const mIdx = monthTaps.indexOf(d.id);
      return {
        ...d,
        ...(wIdx !== -1 ? { order: wIdx } : {}),
        ...(mIdx !== -1 ? { monthlyOrder: mIdx } : {}),
      };
    });
    updateDefinitions(patched);
    setReorderActive(false);
  }

  function cancelGoalReorder() {
    setReorderActive(false);
    setWeekTaps([]);
    setMonthTaps([]);
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

  // Settings' Goal Types > Reorder row navigates here with this param (Editing
  // itself now lives entirely in Settings, so there's no in-place button on this
  // screen to start the tap-to-order flow from). Consumed once and cleared, same
  // as openUnreported above.
  useEffect(() => {
    if (route?.params?.startGoalReorder) {
      startGoalReorder();
      navigation.setParams({ startGoalReorder: undefined });
    }
  }, [route?.params?.startGoalReorder]);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('home.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {onboardingFinishing || !dataLoaded ? (
          <HomeSkeleton />
        ) : (
          <>
            {/* Both grains in one card: they are two views of the same set of goal
                definitions, and the pair of sheets below serve both, so splitting
                them across two cards implied two independent features. EDIT sits on
                the first heading only — there is one goals sheet for both grains.
                Definitions editing itself (name/icon/color/link) has moved entirely
                to Settings' Goal Types > Customize; EDIT here and a long-press on a
                card both just open GoalsModal now — EDIT on the general list, a
                long-press scoped straight to that goal's set-target dialog. */}
            <View style={styles.card}>
              <SectionHeader
                title={reorderActive ? t('home.gridReorderTitle', { title: t(GRAIN.week.gridLabelKey), tapped: weekTaps.length, total: weekVisibleCount }) : t(GRAIN.week.gridLabelKey)}
                actionLabel={reorderActive ? (reorderComplete ? t('common.done') : t('common.cancel')) : t('home.editAction')}
                onAction={reorderActive
                  ? (reorderComplete ? commitGoalReorder : cancelGoalReorder)
                  : () => openGoals('week')}
              />
              <GoalGrid
                definitions={definitions}
                counts={counts}
                goals={goals}
                grain="week"
                onDecrementGoal={decrementWeekGoal}
                onIncrementGoal={incrementWeekGoal}
                onLongPressGoal={id => openGoalTarget('week', id)}
                onSetGoal={id => openGoalTarget('week', id)}
                reorderActive={reorderActive}
                tappedIds={weekTaps}
                onTapGoal={tapWeekGoal}
              />

              <SectionHeader
                title={reorderActive ? t('home.gridReorderTitle', { title: t(GRAIN.month.gridLabelKey), tapped: monthTaps.length, total: monthVisibleCount }) : t(GRAIN.month.gridLabelKey)}
                tightTop
              />
              <GoalGrid
                definitions={definitions}
                counts={monthlyCounts}
                goals={monthlyGoals}
                grain="month"
                onDecrementGoal={decrementMonthGoal}
                onIncrementGoal={incrementMonthGoal}
                onLongPressGoal={id => openGoalTarget('month', id)}
                onSetGoal={id => openGoalTarget('month', id)}
                reorderActive={reorderActive}
                tappedIds={monthTaps}
                onTapGoal={tapMonthGoal}
              />

              {/* Below both grids rather than under the weekly one, since each sheet
                  covers both grains on its own tabs. Disabled during reorder so a tap
                  can't wander off into another sheet mid-sequence. */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, isDark && styles.actionBtnSwapped, reorderActive && styles.actionBtnDisabled]}
                  onPress={() => openGoals('week')}
                  disabled={reorderActive}
                  activeOpacity={0.75}
                >
                  <Ionicons name="list-outline" size={17} color={isDark ? Colors.contactActionBg : Colors.control} />
                  <Text style={[styles.actionBtnText, isDark && styles.actionBtnTextSwapped]}>{t('home.goals')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, isDark && styles.actionBtnSwapped, reorderActive && styles.actionBtnDisabled]}
                  onPress={() => setGraphVisible(true)}
                  disabled={reorderActive}
                  activeOpacity={0.75}
                >
                  <Ionicons name="stats-chart-outline" size={17} color={isDark ? Colors.contactActionBg : Colors.control} />
                  <Text style={[styles.actionBtnText, isDark && styles.actionBtnTextSwapped]}>{t('home.progress')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <UnreportedRow count={unreportedCount} onPress={() => setUnreportedVisible(true)} />
          </>
        )}
      </ScrollView>

      {/* Reloads both grains on close: the sheet's tabs write either one, and
          which of them was touched isn't reported back. */}
      <GoalsModal
        visible={goalsVisible}
        onClose={() => { setGoalsVisible(false); reload(); reloadMonthly(); }}
        definitions={definitions}
        initialGrain={goalsGrain}
        initialEditGoalId={goalsEditGoalId}
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
    </View>
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
      minHeight: HEADER_HEIGHT,
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
      // Asymmetric on purpose: the card sits closer under the primary-colored header than
      // it does above the tab bar. Both grids share one card now, so the content
      // is tall enough to fill the screen and these are the gaps you actually
      // see — the justifyContent above only centres a short page. `gap` is set
      // equal to paddingTop, so the card-to-unreported-row gap matches the
      // header-to-card gap above it.
      paddingTop: 14,
      paddingBottom: 28,
      gap: 14,
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
    // 16 above the buttons, 16 below — matched so the gap from the bottom of
    // the lowest monthly card to the top of the buttons reads the same as the
    // gap from the bottom of the buttons to the bottom of the card. The gap
    // above is not paddingTop alone — the grid already contributes its own 8
    // of bottom padding and a card's 4 of margin, so paddingTop supplies only
    // the remaining 4 of it.
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 4,
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
      // Same fill as the recurring-event pill on a calendar block, rather
      // than contactActionBg — a neutral chip background instead of a
      // colour-of-the-action wash.
      backgroundColor: C.infoChipBg,
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
    actionBtnDisabled: {
      opacity: 0.4,
    },
  });
}
