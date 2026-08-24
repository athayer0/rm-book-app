import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition, goalDisplayLabel } from '../constants/defaultGoals';
import { GoalIcon } from './GoalIcon';

interface Props {
  definition: GoalDefinition;
  count: number;
  /** null when this period has no target set yet — shows a "Set goal" prompt instead of a ratio. */
  goal: number | null;
  /** Tap on the card's left (icon) side. */
  onDecrement?: () => void;
  /** Tap on the card's right (label/count) side. */
  onIncrement?: () => void;
  /** Hard press on either side. */
  onLongPress?: () => void;
  compact?: boolean;
}

export function GoalCard({ definition, count, goal, onDecrement, onIncrement, onLongPress, compact }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const goalReached = goal !== null && goal > 0 && count >= goal;

  function handleDecrement() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecrement?.();
  }

  function handleIncrement() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIncrement?.();
  }

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.iconWrapper, { backgroundColor: isDark ? definition.color : definition.color + '20' }]}>
        <GoalIcon icon={definition.icon} iconFamily={definition.iconFamily} size={compact ? 20 : 24} color={isDark ? lightenColor(definition.color) : definition.color} />
      </View>

      <View style={styles.textCol}>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
          {goalDisplayLabel(definition, t)}
        </Text>
        <View style={styles.countRow}>
          {goal === null ? (
            <Text style={[styles.setGoalText, compact && styles.setGoalTextCompact]}>
              {t('goalPeriodList.setGoals')}
            </Text>
          ) : (
            <>
              <Text style={[styles.count, { color: goalReached ? Colors.success : Colors.accent }, compact && styles.countCompact]}>
                {count}
              </Text>
              <Text style={[styles.goal, compact && styles.goalCompact]}>/{goal}</Text>
              {goalReached && (
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} style={styles.check} />
              )}
            </>
          )}
        </View>
      </View>

      {/* Invisible tap zones laid over the card's real content rather than
          wrapping pieces of it, so the icon/label/count keep their original
          layout — only the touch target is split left/right down the middle.
          activeOpacity=1 keeps them from visibly dimming anything on press. */}
      <View style={styles.touchRow}>
        <TouchableOpacity
          style={styles.touchHalf}
          onPress={onDecrement && handleDecrement}
          onLongPress={onLongPress && handleLongPress}
          disabled={!onDecrement && !onLongPress}
          activeOpacity={1}
        />
        <TouchableOpacity
          style={styles.touchHalf}
          onPress={onIncrement && handleIncrement}
          onLongPress={onLongPress && handleLongPress}
          disabled={!onIncrement && !onLongPress}
          activeOpacity={1}
        />
      </View>
    </View>
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
      // Anchors the absolutely-positioned touchRow overlay below.
      position: 'relative',
    },
    // Longhand rather than `padding`, since the base card now sets
    // paddingVertical — a shorthand here would lose the vertical axis to it
    // whichever order the two are merged in.
    cardCompact: {
      minHeight: 56,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    // Sits on top of the card's real content, split into two equal touch
    // targets — left decrements, right increments — without affecting how the
    // icon/label/count are laid out underneath.
    touchRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
    },
    touchHalf: {
      flex: 1,
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
    setGoalText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.goalTextAction,
    },
    setGoalTextCompact: {
      fontSize: 13,
    },
    check: {
      marginLeft: 4,
      alignSelf: 'center',
    },
  });
}
