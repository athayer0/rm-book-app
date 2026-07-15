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
          borderWidth: 2.5,
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
