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
            <View key={def.id} style={styles.cell}>
              <GoalCard
                definition={def}
                count={counts[def.id] ?? 0}
                // The grid only ever shows the current week, which never resolves to null.
                goal={resolveGoal(goals[def.id], false) ?? 0}
                onPress={onPressGoal}
                compact={compact}
              />
            </View>
          ))}
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
  // A column is half the row by construction, so the last card on an odd row is
  // the same width as a paired one on its own — this replaced an invisible
  // filler View rendered beside it to force the gutter, which produced the same
  // pixels only as long as its flex and margins were kept identical to a card's.
  //
  // flexDirection row so the card's own `flex: 1` still runs along the
  // horizontal axis exactly as it did when the card was a direct child of the
  // row, and its default vertical `stretch` still fills the cell — which the
  // row's own `alignItems: stretch` has already grown to the taller card's
  // height. That is what keeps two cards in a row the same height when one
  // label wraps to a second line and the other doesn't.
  cell: {
    width: '50%',
    flexDirection: 'row',
  },
});
