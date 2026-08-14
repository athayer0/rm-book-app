import React, { useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalIcon } from './GoalIcon';

/**
 * Deliberately carries no colour: every bubble is the button's own `control`
 * blue with a white glyph, so the stack reads as seven faces of the + rather
 * than a second palette competing with the blocks on the calendar behind it.
 * The icon is the whole distinction.
 */
export interface FABAction {
  key: string;
  label: string;
  icon: string;
  iconFamily?: string;
}

interface Props {
  onPress: () => void;
  /**
   * Quick picks that rise out of the button, first entry nearest the thumb.
   * Given these, a tap opens the stack rather than firing `onPress` — a long
   * press still gets there, and is the way to anything not on the list.
   */
  actions?: FABAction[];
  onSelectAction?: (key: string) => void;
}

export const FAB_SIZE = 56;
export const FAB_BOTTOM = 24;
const FAB_RIGHT = 20;
const BUBBLE = 44;
const ROW_GAP = 10;
const ROW_PITCH = BUBBLE + ROW_GAP;
/** Bottom edge of the lowest bubble: clear of the button by one gap. */
const STACK_BOTTOM = FAB_BOTTOM + FAB_SIZE + ROW_GAP;

/**
 * How far row `i` sits above the `+` itself. The rows animate in from exactly
 * this far down, which puts every one of them at the button's centre at rest —
 * so the stack looks like it was pushed out of the + rather than faded in over it.
 */
function travelFor(index: number): number {
  const rowCentre = STACK_BOTTOM + BUBBLE / 2 + index * ROW_PITCH;
  return rowCentre - (FAB_BOTTOM + FAB_SIZE / 2);
}

export function FAB({ onPress, actions, onSelectAction }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const count = actions?.length ?? 0;
  const [mounted, setMounted] = useState(false);
  const rowAnims = useMemo(
    () => Array.from({ length: count }, () => new Animated.Value(0)),
    [count],
  );
  const spin = useRef(new Animated.Value(0)).current;
  /**
   * Which close is the current one. The unmount rides on the close animation's
   * completion, so a reopen mid-collapse would otherwise be torn down by the
   * callback the previous close left in flight.
   */
  const closeToken = useRef(0);

  function openStack() {
    closeToken.current++;
    setMounted(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(spin, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    Animated.stagger(
      45,
      rowAnims.map(a =>
        Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ),
    ).start();
  }

  function closeStack() {
    const token = ++closeToken.current;
    Animated.timing(spin, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
    // Collapses outermost-first, so the stack folds back down into the button
    // instead of dropping out from under itself.
    Animated.stagger(
      35,
      [...rowAnims].reverse().map(a =>
        Animated.timing(a, {
          toValue: 0,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start(() => {
      if (closeToken.current === token) setMounted(false);
    });
  }

  function handlePress() {
    if (!count) {
      onPress();
      return;
    }
    if (mounted) closeStack();
    else openStack();
  }

  function handleSelect(key: string) {
    Haptics.selectionAsync();
    closeStack();
    onSelectAction?.(key);
  }

  return (
    <>
      {mounted && (
        <Animated.View style={[styles.scrim, { opacity: spin }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeStack} />
        </Animated.View>
      )}

      {mounted && (
        <View style={styles.stack} pointerEvents="box-none">
          {(actions ?? []).map((action, i) => {
            const anim = rowAnims[i];
            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.row,
                  {
                    opacity: anim,
                    transform: [
                      {
                        translateY: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [travelFor(i), 0],
                        }),
                      },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.rowTouch}
                  activeOpacity={0.85}
                  onPress={() => handleSelect(action.key)}
                >
                  <View style={styles.labelChip}>
                    <Text style={styles.labelText}>{action.label}</Text>
                  </View>
                  <View style={styles.bubble}>
                    <GoalIcon
                      icon={action.icon}
                      iconFamily={action.iconFamily}
                      size={21}
                      color={Colors.white}
                    />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={handlePress}
        onLongPress={count ? onPress : undefined}
        activeOpacity={0.85}
      >
        <Animated.Text
          style={[
            styles.icon,
            {
              transform: [
                { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
              ],
            },
          ]}
        >
          +
        </Animated.Text>
      </TouchableOpacity>
    </>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: FAB_BOTTOM,
      right: FAB_RIGHT,
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      backgroundColor: C.control,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
      zIndex: 100,
    },
    icon: {
      fontSize: 28,
      color: C.white,
      lineHeight: 32,
      marginTop: -2,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.fabScrim,
      zIndex: 99,
    },
    // Anchored so the bubbles' centre line runs straight through the +.
    stack: {
      position: 'absolute',
      right: FAB_RIGHT + FAB_SIZE / 2 - BUBBLE / 2,
      bottom: STACK_BOTTOM,
      flexDirection: 'column-reverse',
      alignItems: 'flex-end',
      zIndex: 101,
    },
    row: {
      marginTop: ROW_GAP,
    },
    rowTouch: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    labelChip: {
      marginRight: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      // Theme-weighted rather than a flat black: the token is already the right
      // strength for its background, so opacity 1 is the whole shadow.
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 5,
      elevation: 3,
    },
    labelText: {
      fontSize: 14,
      fontWeight: '600',
      color: C.text,
    },
    bubble: {
      width: BUBBLE,
      height: BUBBLE,
      borderRadius: BUBBLE / 2,
      backgroundColor: C.control,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 5,
    },
  });
}
