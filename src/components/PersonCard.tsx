import React, { useMemo, useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import { PERSON_STATUSES } from '../constants/personStatuses';
import { StatusIcon } from './StatusIcon';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';

interface Props {
  person: Person;
  onPress: () => void;
  isFirst?: boolean;
}

export function PersonCard({ person, onPress, isFirst }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [pressed, setPressed] = useState(false);

  const statusConfig = PERSON_STATUSES[person.status] ?? { color: Colors.textLight, icon: 'ellipse' };

  function handlePress() {
    setPressed(true);
    setTimeout(() => setPressed(false), 500);
    onPress();
  }

  return (
    <Pressable
      style={[styles.row, isFirst && styles.rowFirst, pressed && styles.rowPressed]}
      onPress={handlePress}
    >
      <StatusIcon config={statusConfig} size={24} style={styles.statusIcon} />
      <Text style={styles.name}>{person.name}</Text>
    </Pressable>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    rowPressed: {
      backgroundColor: C.rowPressedBg,
    },
    statusIcon: {
      marginRight: 12,
    },
    name: {
      flex: 1,
      fontSize: 16,
      fontWeight: '400',
      color: C.text,
    },
  });
}
