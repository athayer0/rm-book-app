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
      // minHeight and paddingVertical have to come down together: the icon disc
      // is only 40 tall, so a single-line label leaves the content shorter than
      // the minimum and it is the minimum that sets the card's height. Trimming
      // the padding alone would have shrunk nothing but a wrapped two-line card.
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 12,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.07,
      shadowRadius: 4,
      elevation: 2,
    },
    // Longhand rather than `padding`, since the base card now sets
    // paddingVertical — a shorthand here would lose the vertical axis to it
    // whichever order the two are merged in.
    cardCompact: {
      minHeight: 56,
      paddingVertical: 8,
      paddingHorizontal: 10,
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
      fontSize: 11,
      color: C.textSecondary,
      fontWeight: '500',
      lineHeight: 16,
    },
    labelCompact: {
      fontSize: 10,
    },
    countRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    count: {
      fontSize: 20,
      fontWeight: '600',
    },
    countCompact: {
      fontSize: 15,
    },
    goal: {
      fontSize: 20,
      color: C.textSecondary,
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
