import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useTrackDrag } from '../hooks/useTrackDrag';
import type { ColorPalette } from '../constants/colors';
import { withAlpha } from '../utils/colorUtils';

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const STEP_MINUTES = 5;

interface Props {
  minutes: number;
  /** Called on release, not during the drag — see `useTrackDrag`. */
  onChange: (minutes: number) => void;
}

/** "45 min", "1 hr", "2 hr 30 min" — the same shape the event editor shows. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function snap(minutes: number): number {
  const stepped = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, stepped));
}

export function DurationSlider({ minutes, onChange }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  // The drag runs against a local draft so the label tracks the finger without
  // a settings write per frame; the committed value lands on release.
  const [draft, setDraft] = useState(() => snap(minutes));
  const emitted = useRef(snap(minutes));

  useEffect(() => {
    const incoming = snap(minutes);
    if (incoming !== emitted.current) {
      emitted.current = incoming;
      setDraft(incoming);
    }
  }, [minutes]);

  const track = useTrackDrag(
    fx => setDraft(snap(MIN_MINUTES + fx * (MAX_MINUTES - MIN_MINUTES))),
    () => {
      emitted.current = draft;
      onChange(draft);
    },
  );

  const fraction = (draft - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES);

  return (
    <View>
      <Text style={styles.value}>{durationLabel(draft)}</Text>

      <View style={styles.track} {...track.panHandlers} onLayout={track.onLayout}>
        <View style={styles.rail} pointerEvents="none" />
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} pointerEvents="none" />
        <View style={[styles.thumb, { left: `${fraction * 100}%` }]} pointerEvents="none" />
      </View>

      <View style={styles.bounds}>
        <Text style={styles.boundLabel}>{durationLabel(MIN_MINUTES)}</Text>
        <Text style={styles.boundLabel}>{durationLabel(MAX_MINUTES)}</Text>
      </View>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  const THUMB = 22;
  const RAIL = 6;
  return StyleSheet.create({
    value: {
      fontSize: 14,
      fontWeight: '700',
      color: C.control,
      textAlign: 'center',
      marginBottom: 4,
    },
    track: {
      height: THUMB + 12,
      marginHorizontal: THUMB / 2,
      justifyContent: 'center',
    },
    rail: {
      height: RAIL,
      borderRadius: RAIL / 2,
      // A wash of the fill rather than `border`, which is too close to the
      // panel it sits on to read as a track in either theme.
      backgroundColor: withAlpha(C.control, 0.2),
    },
    fill: {
      position: 'absolute',
      height: RAIL,
      borderRadius: RAIL / 2,
      backgroundColor: C.control,
    },
    thumb: {
      position: 'absolute',
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      marginLeft: -THUMB / 2,
      backgroundColor: C.control,
      borderWidth: 3,
      borderColor: C.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 3,
    },
    bounds: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginHorizontal: THUMB / 2,
    },
    boundLabel: { fontSize: 11, color: C.textLight },
  });
}
