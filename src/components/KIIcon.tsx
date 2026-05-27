import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

interface Props {
  icon: string;
  iconFamily?: string;
  size: number;
  color: string;
}

export function KIIcon({ icon, iconFamily, size, color }: Props) {
  if (iconFamily === 'MaterialCommunityIcons') {
    return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
  }
  return <Ionicons name={icon as any} size={size} color={color} />;
}
