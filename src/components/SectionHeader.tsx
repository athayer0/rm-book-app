import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

interface Props {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * For a heading that follows content rather than opening a card. The grid
   * above already contributes its own bottom padding plus a card's margin, so
   * the full top padding stacks into a gap wider than the one under the heading
   * — which reads as the heading floating between the two rather than belonging
   * to the grid beneath it.
   */
  tightTop?: boolean;
}

export function SectionHeader({ title, actionLabel, onAction, tightTop }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={[styles.row, tightTop && styles.rowTightTop]}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    rowTightTop: {
      paddingTop: 11,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: C.text,
    },
    action: {
      fontSize: 14,
      fontWeight: '600',
      color: C.accent,
    },
  });
}
