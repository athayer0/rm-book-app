import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { KIIcon } from './KIIcon';

interface Props {
  definition: IndicatorDefinition;
  count: number;
  compact?: boolean;
}

export function IndicatorCard({ definition, count, compact }: Props) {
  const goalReached = count >= definition.goal;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {/* Icon column */}
      <View style={[styles.iconWrapper, { backgroundColor: definition.color + '20' }]}>
        <KIIcon icon={definition.icon} iconFamily={definition.iconFamily} size={compact ? 20 : 24} color={definition.color} />
      </View>

      {/* Text column */}
      <View style={styles.textCol}>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {definition.label}
        </Text>
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: goalReached ? Colors.success : Colors.accent }, compact && styles.countCompact]}>
            {count}
          </Text>
          <Text style={[styles.goal, compact && styles.goalCompact]}>/{definition.goal}</Text>
          {goalReached && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} style={styles.check} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    margin: 4,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompact: {
    minHeight: 60,
    padding: 10,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
  },
  labelCompact: {
    fontSize: 11,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 18,
    fontWeight: '700',
  },
  countCompact: {
    fontSize: 15,
  },
  goal: {
    fontSize: 18,
    color: Colors.textLight,
    fontWeight: '500',
  },
  goalCompact: {
    fontSize: 15,
  },
  check: {
    marginLeft: 4,
    alignSelf: 'center',
  },
});
