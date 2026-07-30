import React from 'react';
import { View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { StatusConfig } from '../constants/personStatuses';

interface Props {
  config: StatusConfig;
  size: number;
  style?: object;
}

// The ring is drawn by hand rather than as a glyph, so its stroke has to scale
// with `size` — a fixed width reads right in the 14px dropdown and turns hairline
// on the 24px person card. The ratio is the dropdown's weight (2.5 at 14).
const RING_STROKE_RATIO = 2.5 / 14;

export function StatusIcon({ config, size, style }: Props) {
  const Colors = useColors();
  const color = config.themed ? Colors.statusOtherColor : config.color;

  if (config.isRing) {
    return (
      <View
        style={[{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: size * RING_STROKE_RATIO,
          borderColor: color,
        }, style]}
      />
    );
  }
  if (config.isDiamond) {
    return <MaterialCommunityIcons name={config.icon as any} size={size} color={color} style={style} />;
  }
  return <Ionicons name={config.icon as any} size={size} color={color} style={style} />;
}
