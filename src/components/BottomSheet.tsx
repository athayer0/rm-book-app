import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, TouchableOpacity,
  StyleSheet, Animated, Keyboard, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

/**
 * A sheet that rises from the bottom edge over whatever is already on screen,
 * with a Cancel / title / Done header. Distinct from `SheetModal`, which is
 * near-fullscreen and anchored under the app header: this one is for editing a
 * single value, so it covers only as much as that value needs and leaves the
 * list it was opened from visible behind it.
 *
 * The header is built in rather than left to callers, because the whole point of
 * sharing the shell is that two editors opened the same way cannot drift apart.
 *
 * Being a `Modal`, it renders in its own native hierarchy — so it layers over a
 * `SheetModal` correctly, and nothing's `overflow: 'hidden'` can clip it.
 */

interface Props {
  visible: boolean;
  /** Names the thing being edited. */
  title?: string;
  /** Sheet height excluding the safe-area inset; clamped to the window. */
  height: number;
  /** Discards the draft. Also what the backdrop and the Android back button do. */
  onCancel: () => void;
  /** Commits the draft. */
  onDone: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ visible, title, height, onCancel, onDone, children }: Props) {
  const Colors = useColors();
  const styles = makeStyles(Colors);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Always leaves a strip of what is underneath showing, so the sheet reads as
  // sitting over the list rather than replacing it.
  const sheetHeight = Math.min(windowHeight - 80, height);

  // A text field at the bottom of a bottom-anchored sheet would otherwise open
  // the keyboard straight over itself. Plain state rather than an Animated
  // value on purpose: the slide below drives this same node's transform on the
  // native driver, and a JS-driven animation on the same node is what triggers
  // RN's "moved to native" warning.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Kept mounted through the exit so the slide-down can play before unmount —
  // the same reason SheetModal and DropdownMenu track their own mounted flag.
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(sheetHeight);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: sheetHeight, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              // The keyboard covers the home-indicator inset, so the padding
              // that clears it is only wanted while there is no keyboard.
              height: sheetHeight + (keyboardHeight ? 0 : insets.bottom),
              paddingBottom: keyboardHeight ? 0 : insets.bottom,
              marginBottom: keyboardHeight,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.headerBtn} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{title ?? ''}</Text>
            <TouchableOpacity onPress={onDone} style={[styles.headerBtn, styles.headerBtnRight]} hitSlop={8}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.modalBackdrop },
    sheet: {
      width: '100%',
      backgroundColor: C.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      // A sheet rising off the page rather than a card sitting in it, so it gets
      // the detached menu shadow. In dark mode that shadow is invisible against
      // a near-black background, which is what the hairline is there for.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.menuBorder,
      shadowColor: C.menuShadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 16,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    // Matched widths keep the title centred on the sheet rather than on
    // whatever is left over between two labels of different lengths.
    headerBtn: { width: 64 },
    headerBtnRight: { alignItems: 'flex-end' },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
    cancelText: { fontSize: 15, color: C.textSecondary },
    doneText: { fontSize: 15, fontWeight: '700', color: C.accent },
  });
}
