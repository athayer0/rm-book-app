import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useColors } from '../hooks/useColors';
import { useTrackDrag } from '../hooks/useTrackDrag';
import type { ColorPalette } from '../constants/colors';
import { hexToHsv, hsvToHex, hueHex, normalizeHex, type HSV } from '../utils/colorUtils';

interface Props {
  color: string;
  /** Called on release, not during the drag — see `useTrackDrag`. */
  onChange: (hex: string) => void;
}

const STRIP_HEIGHT = 26;
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

/**
 * Where a colour sits on the shade ramp. Only colours actually on the ramp
 * (full saturation, or full brightness) map exactly; everything else — a stored
 * value from the old preset swatches, say — lands nearby, which is all the
 * thumb needs since it is filled with the true colour anyway.
 */
function shadeToFraction({ s, v }: HSV): number {
  return v > 0.999 ? s / 2 : 0.5 + (1 - v) / 2;
}

function fractionToShade(t: number): { s: number; v: number } {
  return t <= 0.5 ? { s: t * 2, v: 1 } : { s: 1, v: 1 - (t - 0.5) * 2 };
}

/** A hue ramp over a white → hue → black shade ramp: any colour in two drags. */
export function GradientColorPicker({ color, onChange }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  // Gradient ids are document-global on web, so two pickers on one screen would
  // otherwise paint each other's ramps.
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

  // HSV, not the hex prop, is what the picker drags: hex loses the hue at pure
  // black and white, so a drag down to black would forget which hue to come
  // back up on.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(normalizeHex(color) ?? '#000000'));
  const emitted = useRef(normalizeHex(color) ?? '#000000');

  const draft = hsvToHex(hsv.h, hsv.s, hsv.v);

  // Adopt colours that changed elsewhere — a reset, say — while ignoring the
  // echo of our own last commit.
  useEffect(() => {
    const incoming = normalizeHex(color);
    if (incoming && incoming !== emitted.current) {
      emitted.current = incoming;
      setHsv(hexToHsv(incoming));
    }
  }, [color]);

  function commit() {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    emitted.current = hex;
    onChange(hex);
  }

  const hue = useTrackDrag(fx => setHsv(prev => ({ ...prev, h: fx * 360 })), commit);
  const shade = useTrackDrag(fx => setHsv(prev => ({ ...prev, ...fractionToShade(fx) })), commit);

  const pure = hueHex(hsv.h);

  return (
    <View style={styles.wrap}>
      <View style={styles.strip} {...shade.panHandlers} onLayout={shade.onLayout}>
        <View style={styles.stripFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`shade-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.5" stopColor={pure} />
                <Stop offset="1" stopColor="#000000" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#shade-${uid})`} />
          </Svg>
        </View>
        <Thumb styles={styles} fill={draft} fraction={shadeToFraction(hsv)} />
      </View>

      <View style={styles.strip} {...hue.panHandlers} onLayout={hue.onLayout}>
        <View style={styles.stripFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`hue-${uid}`} x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map((stop, i) => (
                  <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={stop} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#hue-${uid})`} />
          </Svg>
        </View>
        <Thumb styles={styles} fill={pure} fraction={hsv.h / 360} />
      </View>

      {/* The colour itself is the readout — the hex string it happens to have is
          not something anyone picking a colour needs to read. */}
      <View style={styles.readout}>
        <View style={[styles.preview, { backgroundColor: draft }]} />
      </View>
    </View>
  );
}

function Thumb({
  styles,
  fill,
  fraction,
}: {
  styles: ReturnType<typeof makeStyles>;
  fill: string;
  fraction: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: fill }]}
    />
  );
}

function makeStyles(C: ColorPalette) {
  const thumbSize = STRIP_HEIGHT + 6;
  return StyleSheet.create({
    wrap: { marginBottom: 4 },
    strip: {
      height: STRIP_HEIGHT,
      marginTop: 10,
      // Room for the thumb, which overhangs the track at both ends.
      marginHorizontal: thumbSize / 2,
      justifyContent: 'center',
    },
    stripFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: STRIP_HEIGHT / 2,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    thumb: {
      position: 'absolute',
      width: thumbSize,
      height: thumbSize,
      borderRadius: thumbSize / 2,
      marginLeft: -thumbSize / 2,
      // A card-coloured ring separates the thumb from the ramp it sits on, in
      // either theme; the shadow only has to lift it off a same-toned stretch.
      borderWidth: 3,
      borderColor: C.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 3,
    },
    readout: {
      alignItems: 'center',
      marginTop: 12,
    },
    preview: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
  });
}
