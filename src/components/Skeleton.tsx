import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useColors } from '../hooks/useColors';

interface Props {
  width?: ViewStyle['width'];
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pulsing placeholder block, the piece every skeleton screen in the app
 * composes from. Opacity-driven rather than a translating gradient sweep, so
 * it needs no extra dependency and still reads unambiguously as "loading."
 */
export function Skeleton({ width = '100%', height, borderRadius = 8, style }: Props) {
  const Colors = useColors();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: Colors.skeletonBase, opacity: pulse },
        style,
      ]}
    />
  );
}
