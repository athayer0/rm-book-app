import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { CALENDAR_CHECKBOX_SIZE } from '../utils/eventUtils';

// The weight the outline reads at on a calendar block — the box's "native" size.
// Every other size scales its border to this same ratio, so the outline never
// reads thicker or thinner relative to the box between screens.
const REFERENCE_BORDER_WIDTH = 2;

// The check/uncheck box used by checkbox events (task), both on the calendar block
// and in the edit modal. `color` is the event type's own colour: unchecked is a plain square
// outlined in it with nothing inside; checked fills the box with it and shows a white check.
export function StatusCheckbox({ checked, size, color }: { checked: boolean; size: number; color: string }) {
  const Colors = useColors();
  const radius = Math.max(3, Math.round(size / 6));
  const borderWidth = Math.max(1, Math.round(size * (REFERENCE_BORDER_WIDTH / CALENDAR_CHECKBOX_SIZE)));

  if (checked) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="checkmark-sharp" size={Math.round(size * 0.72)} color={Colors.white} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderWidth,
        borderColor: color,
        backgroundColor: 'transparent',
      }}
    />
  );
}
