import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Pressable, StyleSheet, useWindowDimensions, Animated,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

// The sheet stops just beneath the maroon app header, which every tab screen renders at 60px.
const HEADER_HEIGHT = 60;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Override the gap from the top of the screen. Defaults to the safe-area top + header. */
  topInset?: number;
  /** Fires once the opening slide/fade finishes — for content that shouldn't appear mid-animation. */
  onOpened?: () => void;
}

// A near-fullscreen sheet: its top sits just beneath the maroon header and it fills the rest of
// the screen. The dimmed backdrop fades in uniformly over ~200ms while the sheet slides up, and
// tapping it closes the sheet. The sheet frame stays put when a field is focused — it never
// shifts for the keyboard; the content inside scrolls instead.
export function SheetModal({ visible, onClose, children, topInset, onOpened }: Props) {
  const Colors = useColors();
  const styles = makeStyles(Colors);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gap = topInset ?? insets.top + HEADER_HEIGHT;
  const slideDistance = Math.max(1, height - gap);

  // Kept mounted through the closing animation so the exit can play before unmount.
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(slideDistance)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(slideDistance);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) onOpened?.(); });
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: slideDistance, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/*
        A Modal is its own native view hierarchy, outside the GestureHandlerRootView
        in App.tsx, so gesture-handler needs a root of its own in here. Without one a
        GestureDetector inside a sheet never fires — and worse, its view still claims
        touches into a system that isn't listening, which deadens the whole sheet
        rather than just that component.
      */}
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.root, { paddingTop: gap }]}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            {children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.modalBackdrop },
    sheet: {
      flex: 1,
      width: '100%',
      backgroundColor: C.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      overflow: 'hidden',
    },
  });
}
