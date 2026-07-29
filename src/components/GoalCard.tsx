import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { GoalIcon } from './GoalIcon';

interface Props {
  definition: GoalDefinition;
  count: number;
  goal: number;
  onPress?: () => void;
  compact?: boolean;
}

export function GoalCard({ definition, count, goal, onPress, compact }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  // An unset goal resolves to 0, which every count would otherwise "reach".
  const goalReached = goal > 0 && count >= goal;

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrapper, { backgroundColor: isDark ? definition.color : definition.color + '20' }]}>
        <GoalIcon icon={definition.icon} iconFamily={definition.iconFamily} size={compact ? 20 : 24} color={isDark ? lightenColor(definition.color) : definition.color} />
      </View>

      <View style={styles.textCol}>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {definition.label}
        </Text>
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: goalReached ? Colors.success : Colors.accent }, compact && styles.countCompact]}>
            {count}
          </Text>
          <Text style={[styles.goal, compact && styles.goalCompact]}>/{goal}</Text>
          {goalReached && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} style={styles.check} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: C.card,
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
      color: C.textSecondary,
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
      color: C.textLight,
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
}
