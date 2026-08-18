import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import { ScrollEdgeFade, useScrollEdges } from './ScrollEdgeFade';
import type { ColorPalette } from '../constants/colors';

/**
 * The one dropdown construction in the app. Before this, four screens each had
 * their own near-identical `dropdown` / `dropdownFloating` / `dropdownItem`
 * styles, which is how they drifted apart — different radii, different row
 * heights, one with a border and one without.
 *
 * Three things it fixes over what those had in common:
 *
 *  - **It animates.** They were `{open && <View>}`, a bare conditional mount,
 *    so a menu blinked into existence and blinked out. A menu that appears
 *    instantly reads as a layout bug rather than as a response to the tap.
 *  - **It stays mounted through its exit.** Which is the whole reason the open
 *    state can't just gate the JSX: React would unmount the view before the
 *    close animation had a frame to play. Same trick `SheetModal` uses.
 *  - **It grows from the row that opened it**, via `transformOrigin`. A scale
 *    animation defaults to scaling about the centre, which sends the menu's top
 *    edge *down* and away from its trigger — the opposite of the connection the
 *    animation is meant to draw.
 */

/** iOS context menus are ~13pt. 8 — what these were — reads as a web card. */
export const MENU_RADIUS = 13;

/**
 * Shared by every menu row. Exported because AddEditEventModal sizes its event-type
 * scroll view in whole rows, so it has to agree with this exactly or the list
 * ends on a half-visible row.
 */
export const MENU_ITEM_HEIGHT = 44;

/**
 * Separators stop short of the left edge, as iOS's do — a rule that runs the
 * full width collides with the rounded corner and squares the menu off visually.
 * Matches the row's own horizontal padding so it lines up under the label.
 */
const SEPARATOR_INSET = 14;

// Decelerating, with a touch of overshoot in the tail — the standard "settling
// into place" curve. The exit is quicker and plain-eased: dismissal shouldn't
// make you wait for it.
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN = Easing.bezier(0.4, 0, 1, 1);

const OPEN_MS = 190;
const CLOSE_MS = 130;

interface MenuProps {
  open: boolean;
  children: React.ReactNode;
  /**
   * `anchored` (the default) floats the menu below its trigger, over whatever
   * follows, and needs a positioned parent wrapping trigger + menu. `inline`
   * puts it in normal flow — only for the handful of places where the menu
   * genuinely belongs to the layout rather than hovering above it.
   */
  variant?: 'anchored' | 'inline';
  /**
   * How an anchored menu sits against its parent. `stretch` matches the
   * trigger's width, which is what a field wants. `right`/`left` size to content
   * and pin to that edge — for a menu hanging off an icon button, which is far
   * narrower than its own list.
   *
   * Also decides where the open animation scales from, so the menu grows out of
   * the corner nearest its trigger rather than drifting sideways into place.
   */
  align?: 'stretch' | 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}

export function DropdownMenu({
  open, children, variant = 'anchored', align = 'stretch', style,
}: MenuProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  // Kept mounted through the closing animation, then dropped in its callback.
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1, duration: OPEN_MS, easing: EASE_OUT, useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0, duration: CLOSE_MS, easing: EASE_IN, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.menu,
        variant === 'anchored' ? styles.anchored : styles.inline,
        variant === 'anchored' && styles[align],
        {
          transformOrigin: align === 'stretch' ? 'top center' : `top ${align}`,
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }) },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface ItemProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  /** An icon or colour dot ahead of the label. */
  leading?: React.ReactNode;
  /** Replaces the selected checkmark when given. */
  trailing?: React.ReactNode;
  /** False on the last row — a rule against the menu's bottom edge reads as a seam. */
  showSeparator?: boolean;
  disabled?: boolean;
  labelStyle?: StyleProp<TextStyle>;
}

export function DropdownItem({
  label, onPress, selected = false, leading, trailing,
  showSeparator = true, disabled = false, labelStyle,
}: ItemProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <Pressable
      onPress={() => {
        // The tick that makes a menu feel native. Cheap, and the app already
        // uses selectionAsync for the time wheel and the FAB's quick-add stack.
        Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="menuitem"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [styles.item, pressed && !disabled && styles.itemPressed]}
    >
      {leading}
      <Text
        style={[styles.itemText, selected && styles.itemTextSelected, labelStyle]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing ?? (selected ? <Ionicons name="checkmark" size={17} color={Colors.control} /> : null)}
      {/* Absolutely positioned rather than a borderBottom, so the press
          highlight fills the row's whole height instead of stopping short of
          the rule and leaving a pale line through the middle of the tint. */}
      {showSeparator && <View style={styles.separator} pointerEvents="none" />}
    </Pressable>
  );
}

interface MenuScrollProps {
  /** The same flag driving the DropdownMenu around this. */
  open: boolean;
  /**
   * Position of the selected row among the rows inside, counting any fixed
   * leading row (a "None" entry) as one of them. -1 when nothing is selected,
   * which leaves the list at the top.
   */
  selectedIndex: number;
  /** How many rows fit before it scrolls. Halves are deliberate — see below. */
  maxRows: number;
  children: React.ReactNode;
}

/**
 * A menu's list, for the menus long enough to scroll inside themselves. Three
 * things that a bare ScrollView in a DropdownMenu doesn't do, and that every
 * such menu wants:
 *
 *  - **It caps at a half row.** Ending on a visibly cut row is what says the
 *    list continues; a clean edge at the last full row reads as the end of it.
 *  - **It opens on the selection**, rather than at the top of the list. A field
 *    reading "Temple" that opens on a list apparently starting at "Travel", with
 *    no sign the checkmark is further down, is the failure this avoids. Deferred
 *    a frame because the ScrollView mounts with the menu and has nothing to
 *    scroll until layout has run, and unanimated because the menu is
 *    simultaneously animating itself in.
 *  - **It fades at whichever edge has more behind it** — the rounded,
 *    `overflow: hidden` menu clips the native scroll indicator almost flush, so
 *    the fades are the only cue left.
 */
export function MenuScrollView({ open, selectedIndex, maxRows, children }: MenuScrollProps) {
  const Colors = useColors();
  const ref = useRef<ScrollView>(null);
  const edges = useScrollEdges();

  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      // Lands the selection at the top of the visible list; ScrollView clamps
      // it, so a selection near the end shows the tail instead.
      ref.current?.scrollTo({ y: selectedIndex * MENU_ITEM_HEIGHT, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, selectedIndex]);

  return (
    <>
      <ScrollView
        ref={ref}
        style={{ maxHeight: MENU_ITEM_HEIGHT * maxRows }}
        nestedScrollEnabled
        bounces={false}
        overScrollMode="never"
        {...edges.scrollViewProps}
      >
        {children}
      </ScrollView>
      {/* menuSurface, not card — the menu doesn't sit on the card's colour, so
          fading to `card` would leave a visible band. */}
      <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={edges.showTopFade} />
      <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={edges.showBottomFade} />
    </>
  );
}

/**
 * Divides a menu into sections. Full-bleed rather than inset like a row
 * separator, which is the whole difference between "next item" and "next group"
 * — an inset rule here would just read as another row boundary.
 */
export function MenuDivider() {
  const Colors = useColors();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: Colors.menuSeparator }}
      pointerEvents="none"
    />
  );
}

interface CollapsibleProps {
  open: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// No colour of its own, so it needs none of the palette plumbing the rest of
// this file has. See Collapsible's doc comment for why this is absolute.
const COLLAPSIBLE_CONTENT: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
};

/**
 * For the panels that genuinely belong in the flow — a colour picker, a time
 * wheel — where floating would tear the control away from the row it edits.
 * Those can't stop pushing the rows below down, so instead the push is animated
 * rather than instant.
 *
 * `height: 'auto'` is not animatable, so the content is measured first and the
 * container animated between 0 and that. On the first open there is one frame at
 * height 0 while `onLayout` reports back; overflow is hidden, so that frame shows
 * nothing rather than flashing full-height content.
 *
 * The content is **absolutely positioned**, which is load-bearing and not a
 * detail. Measuring it in normal flow means measuring it inside a box this
 * component has just clamped to height 0 — the child's own layout then depends
 * on the very number being derived from it, and it can measure back as 0, which
 * pins the panel shut forever and renders it permanently blank. Taking the
 * content out of flow breaks that circle: its height is only ever its own
 * content's, so `onLayout` reports the truth on the first pass no matter what
 * the parent is doing. `left: 0, right: 0` keeps its width the parent's.
 *
 * Nothing containing an `anchored` DropdownMenu can go in here — the same
 * overflow that hides the collapse would clip the menu.
 */
export function Collapsible({ open, children, style }: CollapsibleProps) {
  const [mounted, setMounted] = useState(open);
  const [contentHeight, setContentHeight] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    // Height can't run on the native driver, so this one animates on the JS
    // thread. Fine at this size — it drives a single view, not a list.
    if (open && contentHeight > 0) {
      Animated.timing(anim, {
        toValue: 1, duration: 240, easing: EASE_OUT, useNativeDriver: false,
      }).start();
    } else if (!open && mounted) {
      Animated.timing(anim, {
        toValue: 0, duration: 200, easing: EASE_IN, useNativeDriver: false,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [open, contentHeight]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        {
          overflow: 'hidden',
          opacity: anim,
          // outputRange is read at render, so a content height that changes
          // while open (a reset list gaining rows) just re-interpolates.
          height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }),
        },
        style,
      ]}
    >
      <View
        style={COLLAPSIBLE_CONTENT}
        onLayout={e => setContentHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    menu: {
      backgroundColor: C.menuSurface,
      borderRadius: MENU_RADIUS,
      // The hairline and the shadow are a pair, not alternatives. In light mode
      // the surface is the same white as the card underneath, so the edge is
      // what states where the panel starts; the shadow only says how far above
      // it floats. In dark mode they swap roles.
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.menuBorder,
      overflow: 'hidden',
      // Dropped further and spread wider than a card's, so it reads as ambient
      // depth rather than as a dark rim tight to the edge — which would just
      // fight the hairline sitting in the same place.
      shadowColor: C.menuShadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 20,
      // Android draws no shadow from the properties above — elevation is the
      // whole story there, and at 12 these read noticeably flatter than on iOS.
      elevation: 16,
    },
    anchored: {
      position: 'absolute',
      top: '100%',
      marginTop: 6,
      zIndex: 21,
    },
    // Pinned on both edges, so the menu is exactly as wide as the field above it.
    stretch: { left: 0, right: 0 },
    left: { left: 0 },
    right: { right: 0 },
    inline: {
      marginTop: 6,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      height: MENU_ITEM_HEIGHT,
      paddingHorizontal: SEPARATOR_INSET,
    },
    itemPressed: {
      backgroundColor: C.menuPressedBg,
    },
    itemText: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    itemTextSelected: {
      color: C.control,
      fontWeight: '600',
    },
    separator: {
      position: 'absolute',
      left: SEPARATOR_INSET,
      right: 0,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.menuSeparator,
    },
  });
}
