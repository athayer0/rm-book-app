import React, { useMemo, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition, goalDisplayLabel } from '../constants/defaultGoals';
import { GoalIcon } from './GoalIcon';

// RN's TouchableOpacity default (500ms) read as sluggish for opening the goal
// editor — shorter so the hold-to-edit gesture fires sooner.
const LONG_PRESS_DELAY = 300;

// How long the increment/decrement color shows after a quick tap resolves,
// before fading back to the card's resting look.
const FLASH_DURATION = 300;
const PRESS_SCALE = 0.97;

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

  // `pressedSide` is grey and lives exactly as long as a finger is down.
  const [pressedSide, setPressedSide] = useState<'left' | 'right' | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // The increment/decrement flash used to be `flashSide` state cleared by a
  // `setTimeout` — but that timeout runs on the JS thread, and so does the
  // count update `flash` is called alongside (AsyncStorage write, sync-queue
  // push, every other subscribed screen re-rendering off the new count).
  // Whenever that downstream work outran 90ms, the clearing timeout landed
  // late or effectively never got a free moment to fire, so the colour sat
  // there far longer than intended. `scaleAnim` above sidesteps this for the
  // press-scale because it's `useNativeDriver: true`; these two do the same —
  // driven entirely by the native animation driver, so the fade runs on the
  // UI thread and finishes on schedule no matter how busy JS is.
  const leftFlashAnim = useRef(new Animated.Value(0)).current;
  const rightFlashAnim = useRef(new Animated.Value(0)).current;

  function setPressed(side: 'left' | 'right' | null) {
    setPressedSide(side);
    Animated.timing(scaleAnim, {
      toValue: side ? PRESS_SCALE : 1,
      duration: side ? 80 : 120,
      useNativeDriver: true,
    }).start();
  }

  function flash(anim: Animated.Value) {
    anim.stopAnimation();
    anim.setValue(1);
    Animated.timing(anim, { toValue: 0, duration: FLASH_DURATION, useNativeDriver: true }).start();
  }

  // Props close over a fresh function identity every render (GoalGrid rebuilds
  // its onDecrement/onIncrement/onLongPress callbacks on every count change),
  // but the gesture objects below are only rebuilt when whether a long-press
  // exists at all *structurally* changes (see the useMemo deps). Routing
  // through refs lets that memoized gesture always call whatever the latest
  // render's handler actually is, instead of freezing on the props from
  // whichever render first built it.
  const onDecrementRef = useRef(onDecrement);
  onDecrementRef.current = onDecrement;
  const onIncrementRef = useRef(onIncrement);
  onIncrementRef.current = onIncrement;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  function handleDecrement() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flash(leftFlashAnim);
    onDecrementRef.current?.();
  }

  function handleIncrement() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flash(rightFlashAnim);
    onIncrementRef.current?.();
  }

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPressRef.current?.();
  }

  // A tap and a long-press are recognised natively (gesture-handler measures
  // `minDuration` on the UI thread), not on a JS `setTimeout` — the previous
  // approach used our own timer instead of TouchableOpacity's built-in
  // delayLongPress because that one had been observed firing seconds late
  // under the New Architecture, but a hand-rolled setTimeout is bound to the
  // exact same JS-thread queue and was just as liable to run late whenever
  // the thread was busy. Racing the two gestures means only the winner's
  // callback crosses the bridge, and the 300ms deadline itself is decided
  // natively either way.
  //
  // Both gestures drive the pressed-grey tint, not just whichever one wins —
  // when `tap` wins a quick release, `longPress` is still only mid-count and
  // gets cancelled rather than genuinely finished, and that cancellation path
  // doesn't reliably run its onFinalize, which left the tint stuck on. Both
  // onBegin/onFinalize pairs span touch-down to release regardless of outcome
  // for whichever gesture *does* conclude cleanly, and setPressed is
  // idempotent, so having both touch it on every press is harmless.
  //
  // Memoized: gesture-handler tears down and reattaches its native handler
  // whenever GestureDetector receives a new gesture object, and every tap or
  // long-press here ends by setting state (pressedSide, or a parent count
  // update flowing back down), which re-renders this component. Rebuilding
  // fresh on every render would reset the in-flight recognizer mid-touch, so
  // only rebuild when a long-press handler starts or stops existing at all
  // (reorder mode toggling it off/on); the handler functions themselves stay
  // fresh via the refs above regardless.
  function makeSideGesture(side: 'left' | 'right', hasLongPress: boolean, onTap: () => void) {
    const tap = Gesture.Tap()
      .maxDuration(60_000)
      .runOnJS(true)
      .onBegin(() => setPressed(side))
      .onEnd((_e, success) => { if (success) onTap(); })
      .onFinalize(() => setPressed(null));

    if (!hasLongPress) return tap;

    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_DELAY)
      .runOnJS(true)
      .onBegin(() => setPressed(side))
      .onStart(() => handleLongPress())
      .onFinalize(() => setPressed(null));

    return Gesture.Race(longPress, tap);
  }

  const hasLongPress = !!onLongPress;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leftGesture = useMemo(() => makeSideGesture('left', hasLongPress, handleDecrement), [hasLongPress]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rightGesture = useMemo(() => makeSideGesture('right', hasLongPress, handleIncrement), [hasLongPress]);

  return (
    <Animated.View style={[styles.card, compact && styles.cardCompact, { transform: [{ scale: scaleAnim }] }]}>
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
          layout — only the touch target is split left/right down the middle. */}
      <View style={styles.touchRow}>
        <GestureDetector gesture={leftGesture}>
          <View
            style={[
              styles.touchHalf,
              styles.touchHalfLeft,
              pressedSide === 'left' && { backgroundColor: Colors.rowPressedBg },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.touchHalfFlash,
                styles.touchHalfLeft,
                { backgroundColor: Colors.goalCardDecrementBg, opacity: leftFlashAnim },
              ]}
            />
          </View>
        </GestureDetector>
        <GestureDetector gesture={rightGesture}>
          <View
            style={[
              styles.touchHalf,
              styles.touchHalfRight,
              pressedSide === 'right' && { backgroundColor: Colors.rowPressedBg },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.touchHalfFlash,
                styles.touchHalfRight,
                { backgroundColor: Colors.goalCardIncrementBg, opacity: rightFlashAnim },
              ]}
            />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
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
    // The increment/decrement flash overlay — a separate absolutely-filled
    // layer over its touchHalf rather than that view's own backgroundColor,
    // so its opacity can be driven by a native-thread Animated value instead
    // of JS state.
    touchHalfFlash: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    // Matches the card's own corner radius so a half's press tint doesn't
    // square off the corners it shares with the card.
    touchHalfLeft: {
      borderTopLeftRadius: 12,
      borderBottomLeftRadius: 12,
    },
    touchHalfRight: {
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
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
