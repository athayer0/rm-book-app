import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalCard } from './GoalCard';
import { GoalDefinition } from '../constants/defaultGoals';
import { WeeklyCounts, WeeklyGoals, resolveGoal } from '../hooks/useWeeklyGoals';
import { GoalGrain, GRAIN, sortForGrain } from '../utils/goalGrain';

const BADGE_SIZE = 22;

interface Props {
  definitions: GoalDefinition[];
  counts: WeeklyCounts;
  goals: WeeklyGoals;
  /** Which grid this is — drives both visibility and position, independently of the other grain. */
  grain: GoalGrain;
  /** Tap on a card's left/icon side (outside reorder mode): decrements its count by one. */
  onDecrementGoal?: (id: string) => void;
  /** Tap on a card's right/label side (outside reorder mode): increments its count by one. */
  onIncrementGoal?: (id: string) => void;
  /** Hard press on either side of a card (outside reorder mode): opens that goal's editor. */
  onLongPressGoal?: (id: string) => void;
  /** Tap on a card with no target set yet (outside reorder mode): opens the Goals menu on that goal instead of stepping a count against a target that doesn't exist. */
  onSetGoal?: (id: string) => void;
  compact?: boolean;
  /**
   * Tap-to-number reorder mode (see HomeScreen): every visible card shows a
   * numbered badge and a tap registers its place in the new order instead of
   * opening the Goals sheet.
   */
  reorderActive?: boolean;
  /** This grain's tap sequence so far, in the order tapped. */
  tappedIds?: string[];
  onTapGoal?: (id: string) => void;
}

export function GoalGrid({
  definitions, counts, goals, grain, onDecrementGoal, onIncrementGoal, onLongPressGoal, onSetGoal, compact, reorderActive, tappedIds, onTapGoal,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { visibilityKey } = GRAIN[grain];
  const visible = useMemo(
    () => sortForGrain(definitions.filter(d => d[visibilityKey]), grain),
    [definitions, grain, visibilityKey],
  );
  const rows: GoalDefinition[][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(def => {
            const tapIndex = tappedIds?.indexOf(def.id) ?? -1;
            // The grid only ever shows the current period, which resolveGoal
            // leaves unset (null) rather than defaulting to 0, so an unset
            // goal shows a "Set goal" prompt instead of a false 0 target.
            const goal = resolveGoal(goals[def.id], false);
            // Outside reorder mode, a tap on an unset goal has nothing to step —
            // it opens the Goals menu on that goal instead of incrementing or
            // decrementing a count against a target that doesn't exist yet.
            const handleTap = (fallback?: (id: string) => void) => () => {
              if (reorderActive) return onTapGoal?.(def.id);
              if (goal === null) return onSetGoal?.(def.id);
              return fallback?.(def.id);
            };
            return (
              <View key={def.id} style={styles.cell}>
                <GoalCard
                  definition={def}
                  count={counts[def.id] ?? 0}
                  goal={goal}
                  onDecrement={handleTap(onDecrementGoal)}
                  onIncrement={handleTap(onIncrementGoal)}
                  onLongPress={reorderActive ? undefined : () => onLongPressGoal?.(def.id)}
                  compact={compact}
                />
                {reorderActive && (
                  // Purely a decorative overlay on top of the card's own touchable — without
                  // this, tapping the corner it sits in would hit the badge instead of
                  // registering on the card underneath.
                  <View
                    pointerEvents="none"
                    style={[
                      styles.badge,
                      tapIndex !== -1
                        ? { backgroundColor: def.color }
                        : { borderColor: def.color, borderWidth: 2 },
                    ]}
                  >
                    {tapIndex !== -1 && <Text style={styles.badgeText}>{tapIndex + 1}</Text>}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
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
      position: 'relative',
    },
    // Same fill/outline language as StatusCheckbox: unfilled is an outline in
    // the goal's own colour, filled is a solid disc of it with a white number —
    // so the badge reads as belonging to the card it sits on rather than as a
    // generic control.
    badge: {
      position: 'absolute',
      top: -6,
      right: -2,
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      borderRadius: BADGE_SIZE / 2,
      backgroundColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 3,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.white,
    },
  });
}
