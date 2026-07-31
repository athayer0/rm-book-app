import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { Svg, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

const FADE_HEIGHT = 18;
// Guards against float rounding on the offset/content-size math flipping a fade
// on and off by a sub-pixel amount.
const EPSILON = 2;

// SVG gradient ids are document-global; several dropdowns can be mounted at once.
let gradientSeq = 0;

/**
 * Tracks scroll position against content/viewport height so a caller can show
 * top/bottom fade cues in place of the native scroll indicator, which the
 * `overflow: hidden` + rounded-corner dropdowns in this app clip almost flush.
 */
export function useScrollEdges() {
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const onContentSizeChange = useCallback((_w: number, h: number) => setContentHeight(h), []);
  const onLayout = useCallback((e: LayoutChangeEvent) => setViewportHeight(e.nativeEvent.layout.height), []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollTop(e.nativeEvent.contentOffset.y);
  }, []);

  return {
    scrollViewProps: { onContentSizeChange, onLayout, onScroll, scrollEventThrottle: 16 },
    showTopFade: scrollTop > EPSILON,
    showBottomFade: scrollTop < contentHeight - viewportHeight - EPSILON,
  };
}

interface Props {
  edge: 'top' | 'bottom';
  color: string;
  visible: boolean;
}

/** Dissolves the scrollable list into `color` at the given edge to hint more content lies offscreen. */
export function ScrollEdgeFade({ edge, color, visible }: Props) {
  const gradientId = useMemo(() => `scrollFade${gradientSeq++}`, []);
  if (!visible) return null;
  return (
    <View style={[styles.wrap, edge === 'top' ? styles.top : styles.bottom]} pointerEvents="none">
      <Svg width="100%" height={FADE_HEIGHT}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1={edge === 'top' ? '1' : '0'} x2="0" y2={edge === 'top' ? '0' : '1'}>
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={FADE_HEIGHT} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
