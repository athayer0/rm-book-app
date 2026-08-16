import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GoalCard } from './GoalCard';
import { GoalDefinition } from '../constants/defaultGoals';
import { WeeklyCounts, WeeklyGoals, resolveGoal } from '../hooks/useWeeklyGoals';

interface Props {
  definitions: GoalDefinition[];
  counts: WeeklyCounts;
  goals: WeeklyGoals;
  onPressGoal?: () => void;
  compact?: boolean;
  /** Which of a goal's two independent visibility flags this grid honours. Defaults to the weekly one. */
  visibilityKey?: 'visible' | 'monthlyVisible';
}

export function GoalGrid({ definitions, counts, goals, onPressGoal, compact, visibilityKey = 'visible' }: Props) {
  const visible = definitions.filter(d => d[visibilityKey]);
  const rows: GoalDefinition[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(def => (
            <GoalCard
              key={def.id}
              definition={def}
              count={counts[def.id] ?? 0}
              // The grid only ever shows the current week, which never resolves to null.
              goal={resolveGoal(goals[def.id], false) ?? 0}
              onPress={onPressGoal}
              compact={compact}
            />
          ))}
          {row.length === 1 && <View style={styles.placeholder} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  placeholder: {
    flex: 1,
    margin: 4,
  },
});
