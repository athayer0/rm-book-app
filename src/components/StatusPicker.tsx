import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useColors } from '../hooks/useColors';
import { EventStatus } from '../utils/eventUtils';

/**
 * The three reporting states, worst to best — the one order every display of all
 * three uses. This component is the only such display, so it is the only place
 * that order needs to be stated.
 */
const OPTIONS: { value: EventStatus; icon: string }[] = [
  { value: 'failed', icon: 'ban' },
  { value: 'pending', icon: 'alert-circle' },
  { value: 'completed', icon: 'checkmark-circle' },
];

export function statusLabel(status: EventStatus, t: TFunction): string {
  return t(`eventStatus.${status}`);
}

/** The size the event edit modal has always drawn these at. */
export const BASE_SIZE = 54;

interface Props {
  value: EventStatus | undefined;
  /** Receives undefined when the active state is tapped a second time. */
  onChange: (status: EventStatus | undefined) => void;
  size?: number;
}

/**
 * Tap to set a state, tap it again to clear.
 *
 * Shared rather than copied because `ban` is genuinely awkward: it is mirrored
 * horizontally, drawn slightly smaller than the other two, and when selected
 * becomes a filled disc with a white glyph rather than a solid icon. Reproducing
 * that by hand somewhere else is how two pickers end up subtly different.
 *
 * Every dimension is a ratio of BASE_SIZE, so the edit modal's 54px rendering is
 * unchanged and smaller call sites scale whole.
 */
export function StatusPicker({ value, onChange, size = BASE_SIZE }: Props) {
  const Colors = useColors();

  // From the palette, not literals: an amber icon here and an amber badge on a
  // calendar block have to mean the same thing.
  const color: Record<EventStatus, string> = {
    pending: Colors.statusPending,
    completed: Colors.statusCompleted,
    failed: Colors.statusFailed,
  };

  const scale = size / BASE_SIZE;
  const banSize = 51 * scale;
  const disc = 45 * scale;
  const discGlyph = 39 * scale;

  return (
    <View style={{ flexDirection: 'row', gap: 12 * scale, alignItems: 'center' }}>
      {OPTIONS.map(opt => {
        const selected = value === opt.value;
        const isBan = opt.icon === 'ban';

        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(selected ? undefined : opt.value)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={isBan ? { width: banSize, height: size, alignItems: 'center', justifyContent: 'center' } : undefined}
          >
            {isBan && selected ? (
              <View style={{
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: color.failed,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons
                  name="ban-outline"
                  size={discGlyph}
                  color={Colors.white}
                  style={{ transform: [{ scaleX: -1 }] }}
                />
              </View>
            ) : (
              <Ionicons
                name={(selected ? opt.icon : `${opt.icon}-outline`) as any}
                size={isBan ? banSize : size}
                color={color[opt.value]}
                style={isBan ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
