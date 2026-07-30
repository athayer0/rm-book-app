import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';

// The check/uncheck box used by checkbox events (task), both on the calendar block
// and in the edit modal. `color` is the event type's own colour: unchecked is a plain square
// outlined in it with nothing inside; checked fills the box with it and shows a white check.
export function StatusCheckbox({ checked, size, color }: { checked: boolean; size: number; color: string }) {
  const Colors = useColors();
  const radius = Math.max(3, Math.round(size / 6));

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
        borderWidth: 2,
        borderColor: color,
        backgroundColor: 'transparent',
      }}
    />
  );
}
