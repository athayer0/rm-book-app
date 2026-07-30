import React, { useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, LayoutChangeEvent,
  StyleProp, TextStyle, ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/** How wide the fade at the edge of an overflowing value runs. */
const FADE_WIDTH = 32;

/**
 * The affordance: the value dissolving into the card at the edge it continues past.
 *
 * A gradient rather than a chevron or a scrollbar, because it says *what* is
 * happening — the text is cut off here, not ending here — and because neither
 * platform shows a horizontal scrollbar at rest. Painted in the surface colour
 * it sits on, so pass the background it overlays.
 */
export function EdgeFade({
  color, side, style,
}: {
  color: string;
  side: 'left' | 'right';
  /** For insetting it off something it must not paint over, such as a field's rule. */
  style?: StyleProp<ViewStyle>;
}) {
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;
  const id = `fade-${side}-${uid}`;
  // Opacity, not colour, so the same token works in both themes: the fade lands
  // on whatever the card actually is rather than on a second hardcoded value.
  const opaqueOffset = side === 'right' ? '1' : '0';
  const clearOffset = side === 'right' ? '0' : '1';

  return (
    <View
      pointerEvents="none"
      style={[styles.fade, side === 'right' ? { right: 0 } : { left: 0 }, style]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset={clearOffset} stopColor={color} stopOpacity={0} />
            <Stop offset={opaqueOffset} stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

interface Props {
  value: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** The surface the fade is painted in — whatever sits behind this row. */
  fadeColor: string;
}

/**
 * A single-line value too long for its row, shown in full and dragged through
 * rather than cut off with an ellipsis.
 *
 * For values that are one opaque string — a Messenger profile URL, say — where
 * the tail is as load-bearing as the head and truncating either end loses the
 * part that identifies the person. A fade marks whichever side still has more.
 */
export function ScrollableValue({ value, textStyle, style, fadeColor }: Props) {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);

  // A pixel of slack: the two widths are measured independently and can land a
  // hair apart on text that actually fits.
  const overflowing = content > viewport + 1;
  const moreLeft = overflowing && offset > 1;
  const moreRight = overflowing && offset < content - viewport - 1;

  return (
    <View style={style}>
      <ScrollView
        horizontal
        // Hugs the text's height rather than stretching to whatever the row
        // offers, which is what keeps the fade the height of the line it marks.
        style={styles.scroller}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onLayout={(e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={w => setContent(w)}
        onScroll={e => setOffset(e.nativeEvent.contentOffset.x)}
      >
        <Text style={textStyle}>{value}</Text>
      </ScrollView>
      {moreLeft && <EdgeFade color={fadeColor} side="left" />}
      {moreRight && <EdgeFade color={fadeColor} side="right" />}
    </View>
  );
}

/**
 * How wide `value` wants to be, regardless of the width it has been given. Draws
 * nothing.
 *
 * For the editable twin of the above: a TextInput scrolls its own content, so it
 * needs no scroller wrapped around it, but it also reports nothing about whether
 * the content overflows — and a Text asked to measure itself answers with the
 * width it was clipped to. A horizontal ScrollView is the measuring device,
 * since its content is laid out unbounded.
 */
export function TextWidthProbe({
  value, textStyle, onMeasure,
}: {
  value: string;
  textStyle?: StyleProp<TextStyle>;
  onMeasure: (width: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      scrollEnabled={false}
      pointerEvents="none"
      style={styles.probe}
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={w => onMeasure(w)}
    >
      <Text style={textStyle}>{value}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
  },
  // Absolute and invisible: it exists to be measured, not to be laid out or seen.
  probe: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
  },
});
