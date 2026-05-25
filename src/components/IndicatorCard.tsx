import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { IndicatorDefinition } from '../constants/defaultIndicators';

interface Props {
  definition: IndicatorDefinition;
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
}

export function IndicatorCard({ definition, count, onIncrement, onDecrement, compact }: Props) {
  const goalReached = count >= definition.goal;

  function handleIncrement() {
    Haptics.impactAsync(
      goalReached ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
    );
    onIncrement();
  }

  function handleDecrement() {
    if (count <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecrement();
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={[styles.iconWrapper, { backgroundColor: definition.color + '20' }]}>
            <Ionicons name={definition.icon as any} size={compact ? 18 : 22} color={definition.color} />
          </View>
          {goalReached && (
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          )}
        </View>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {definition.label}
        </Text>
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={handleDecrement}
            style={[styles.controlBtn, count <= 0 && styles.controlBtnDisabled]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name="remove"
              size={16}
              color={count <= 0 ? Colors.textLight : Colors.textSecondary}
            />
          </TouchableOpacity>
          <View style={styles.countRow}>
            <Text style={[styles.count, { color: goalReached ? Colors.success : Colors.accent }, compact && styles.countCompact]}>
              {count}
            </Text>
            <Text style={[styles.goal, compact && styles.goalCompact]}>/{definition.goal}</Text>
          </View>
          <TouchableOpacity
            onPress={handleIncrement}
            style={styles.controlBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="add" size={16} color={Colors.accent} />
          </TouchableOpacity>
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
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompact: {
    minHeight: 100,
  },
  inner: {
    padding: 12,
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
    flex: 1,
    marginBottom: 8,
  },
  labelCompact: {
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnDisabled: {
    opacity: 0.4,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 20,
    fontWeight: '700',
  },
  countCompact: {
    fontSize: 17,
  },
  goal: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '500',
  },
  goalCompact: {
    fontSize: 11,
  },
});
