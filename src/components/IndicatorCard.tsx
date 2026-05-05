import React, { useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { IndicatorDefinition } from '../constants/defaultIndicators';

interface Props {
  definition: IndicatorDefinition;
  count: number;
  onIncrement: () => void;
  onReset: () => void;
  compact?: boolean;
}

export function IndicatorCard({ definition, count, onIncrement, onReset, compact }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const goalReached = count >= definition.goal;

  function handlePress() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }),
    ]).start();
    Haptics.impactAsync(
      goalReached ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
    );
    onIncrement();
  }

  function handleLongPress() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onReset();
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>
        <View style={[styles.iconWrapper, { backgroundColor: definition.color + '20' }]}>
          <Ionicons name={definition.icon as any} size={compact ? 18 : 22} color={definition.color} />
        </View>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {definition.label}
        </Text>
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: goalReached ? Colors.success : Colors.accent }, compact && styles.countCompact]}>
            {count}
          </Text>
          <Text style={[styles.goal, compact && styles.goalCompact]}>/{definition.goal}</Text>
        </View>
        {goalReached && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    margin: 4,
    minHeight: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompact: {
    minHeight: 88,
  },
  pressed: {
    opacity: 0.9,
  },
  inner: {
    padding: 12,
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 16,
    marginBottom: 4,
    flex: 1,
  },
  labelCompact: {
    fontSize: 11,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 22,
    fontWeight: '700',
  },
  countCompact: {
    fontSize: 18,
  },
  goal: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
  },
  goalCompact: {
    fontSize: 12,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});
