import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { BottomSheet } from './BottomSheet';
import { DurationSlider, durationLabel } from './DurationSlider';

/**
 * The duration counterpart to `ColorPickerSheet`: a type's default length,
 * edited on a sheet over the list rather than in a panel that expands inside it.
 * Far simpler than the colour sheet — one control, no tabs — but the same shell,
 * the same header, and the same draft-until-Done contract, so the two rows in
 * Settings behave identically when tapped.
 */

// Header, readout, slider, and the default line — nothing that grows, so the
// sheet can be a fixed height rather than measured.
const SHEET_HEIGHT = 250;

interface Props {
  visible: boolean;
  minutes: number;
  /** Names the type being edited. */
  title?: string;
  /** The type's stock duration, offered as a way back. */
  defaultMinutes?: number;
  onCancel: () => void;
  onDone: (minutes: number) => void;
}

export function DurationSheet({ visible, minutes, title, defaultMinutes, onCancel, onDone }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { height } = useWindowDimensions();

  const [draft, setDraft] = useState(minutes);

  useEffect(() => {
    if (visible) setDraft(minutes);
  }, [visible]);

  const showDefault = defaultMinutes !== undefined && defaultMinutes !== draft;

  return (
    <BottomSheet
      visible={visible}
      title={title}
      height={Math.min(SHEET_HEIGHT, Math.round(height * 0.45))}
      onCancel={onCancel}
      onDone={() => onDone(draft)}
    >
      <View style={styles.body}>
        <DurationSlider minutes={draft} onChange={setDraft} />

        {/* Always rendered once the type has a stock value, faded rather than
            hidden when the draft already matches it — the same reason the colour
            sheet keeps its default swatch on screen. Hiding it would move the
            slider every time the duration left its default. */}
        {defaultMinutes !== undefined && (
          <TouchableOpacity
            style={styles.defaultRow}
            disabled={!showDefault}
            onPress={() => setDraft(defaultMinutes)}
            hitSlop={8}
          >
            <Ionicons
              name="refresh"
              size={13}
              color={showDefault ? Colors.control : Colors.textLight}
            />
            <Text style={[styles.defaultText, !showDefault && styles.defaultTextMuted]}>
              Default {durationLabel(defaultMinutes)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </BottomSheet>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    // Generous above the readout so the header sits clear of it rather than
    // right on top of the value it labels. The sheet is a fixed height with room
    // to spare, so this comes out of slack at the bottom, not off the slider.
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 28 },
    defaultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: 18,
    },
    defaultText: { fontSize: 13, fontWeight: '600', color: C.control },
    defaultTextMuted: { color: C.textLight, fontWeight: '400' },
  });
}
