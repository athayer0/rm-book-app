import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useMonthlyGoals } from '../hooks/useMonthlyGoals';
import { GoalGrain, GRAINS, GRAIN } from '../utils/goalGrain';
import { GoalPeriodList } from '../components/GoalPeriodList';
import { SheetTabs } from '../components/SheetTabs';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  /** Which grain the sheet opens on — the grid that was tapped. Defaults to weekly. */
  initialGrain?: GoalGrain;
}

/**
 * Setting counts and targets, tabbed by grain. It replaced a pair of sheets that
 * were the same screen twice over, one per grain, reached from two separate Home
 * buttons — splitting the two grains across tabs of one sheet is what keeps the
 * Home card down to two buttons instead of four.
 *
 * Both hooks are called unconditionally, since hooks can't be chosen per tab and
 * the sheet needs whichever grain is showing. The Home screen already holds both
 * for its two grids, so this adds a second pair of `deriveWeekGoalCounts` passes
 * rather than a first.
 */
export function GoalsModal({ visible, onClose, definitions, initialGrain = 'week' }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const weekly = useWeeklyGoals();
  const monthly = useMonthlyGoals();

  const [grain, setGrain] = useState<GoalGrain>('week');
  // While the list's edit dialog is up, its backdrop covers only the sheet body —
  // freezing the header and tabs keeps a stray tap from closing the sheet, or
  // switching grain, out from under an uncommitted dialog.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (visible) {
      setGrain(initialGrain);
      setEditing(false);
    }
  }, [visible, initialGrain]);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.header} pointerEvents={editing ? 'none' : 'auto'}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('goalsModal.title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <SheetTabs
          tabs={GRAINS.map(g => ({ key: g, label: t(GRAIN[g].tabLabelKey) }))}
          active={grain}
          onChange={setGrain}
          disabled={editing}
        />

        {/* Keyed by grain so switching tabs remounts the list rather than
            feeding it a new grain's accessors while it still holds the old
            grain's rows and offset. */}
        {grain === 'week' ? (
          <GoalPeriodList
            key="week"
            grain="week"
            definitions={definitions}
            counts={weekly.counts}
            goals={weekly.goals}
            getPeriodData={weekly.getWeekData}
            saveCount={weekly.saveCountForWeek}
            saveGoal={weekly.saveGoalForWeek}
            onEditingChange={setEditing}
          />
        ) : (
          <GoalPeriodList
            key="month"
            grain="month"
            definitions={definitions}
            counts={monthly.counts}
            goals={monthly.goals}
            getPeriodData={monthly.getMonthData}
            saveCount={monthly.saveCountForMonth}
            saveGoal={monthly.saveGoalForMonth}
            onEditingChange={setEditing}
          />
        )}
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
    closeBtn: { width: 44, alignItems: 'flex-start' },
  });
}
