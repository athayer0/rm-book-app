import React from 'react';
import { View, StyleSheet } from 'react-native';
import { IndicatorCard } from './IndicatorCard';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { WeeklyCounts } from '../hooks/useWeeklyIndicators';

interface Props {
  definitions: IndicatorDefinition[];
  counts: WeeklyCounts;
  compact?: boolean;
}

export function IndicatorGrid({ definitions, counts, compact }: Props) {
  const visible = definitions.filter(d => d.visible);
  const rows: IndicatorDefinition[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(def => (
            <IndicatorCard
              key={def.id}
              definition={def}
              count={counts[def.id] ?? 0}
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
