import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useMonthlyGoals } from '../hooks/useMonthlyGoals';
import { GoalGrain, GRAINS, GRAIN } from '../utils/goalGrain';
import { GoalGraph } from '../components/GoalGraph';
import { SheetTabs } from '../components/SheetTabs';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  /** Which grain the sheet opens on. Defaults to weekly. */
  initialGrain?: GoalGrain;
}

/**
 * Six periods of achieved-against-target, tabbed by grain — the chart that used
 * to be the second tab of a "Weekly Planning" sheet whose first tab was the goal
 * list. Tabbing by grain instead means the monthly chart came for free and the
 * Home card needs one button for both, rather than one per grain.
 *
 * Nothing here is editable, so there is no draft state and no commit on close —
 * `onClose` just closes.
 */
export function GoalGraphModal({ visible, onClose, definitions, initialGrain = 'week' }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { getWeekData } = useWeeklyGoals();
  const { getMonthData } = useMonthlyGoals();

  const [grain, setGrain] = useState<GoalGrain>('week');

  useEffect(() => {
    if (visible) setGrain(initialGrain);
  }, [visible, initialGrain]);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Goal Graph</Text>
          <View style={{ width: 44 }} />
        </View>

        <SheetTabs
          tabs={GRAINS.map(g => ({ key: g, label: GRAIN[g].graphTabLabel }))}
          active={grain}
          onChange={setGrain}
        />

        {/* Keyed by grain so switching tabs remounts the chart rather than
            leaving the previous grain's six points plotted under the new
            grain's axis while the reload lands. */}
        <GoalGraph
          key={grain}
          definitions={definitions}
          grain={grain}
          getPeriodData={grain === 'week' ? getWeekData : getMonthData}
        />
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
