import React, { useMemo, useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { PERSON_STATUSES } from '../constants/personStatuses';
import { StatusIcon } from './StatusIcon';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';

interface Props {
  person: Person;
  onPress: () => void;
  isFirst?: boolean;
  /**
   * Marks the row as picked, for the lists that choose people rather than open
   * them. Left undefined by the People tab, where a row leads somewhere instead
   * of holding a state.
   */
  selected?: boolean;
}

export function PersonCard({ person, onPress, isFirst, selected }: Props) {
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
      style={[
        styles.row,
        isFirst && styles.rowFirst,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={handlePress}
    >
      <StatusIcon config={statusConfig} size={24} style={styles.statusIcon} />
      <Text style={styles.name}>{person.name}</Text>
      {selected && <Ionicons name="checkmark" size={20} color={Colors.control} />}
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
    rowSelected: {
      backgroundColor: C.rowSelectedBg,
    },
    // Listed after rowSelected so a touch still reads on an already-picked row.
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
