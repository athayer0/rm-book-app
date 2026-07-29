import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Pressable, StyleSheet, useWindowDimensions, Animated,
} from 'react-native';
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
}

// A near-fullscreen sheet: its top sits just beneath the maroon header and it fills the rest of
// the screen. The dimmed backdrop fades in uniformly over ~200ms while the sheet slides up, and
// tapping it closes the sheet. The sheet frame stays put when a field is focused — it never
// shifts for the keyboard; the content inside scrolls instead.
export function SheetModal({ visible, onClose, children, topInset }: Props) {
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
      ]).start();
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
      <View style={[styles.root, { paddingTop: gap }]}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </View>
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
