import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';

interface Props {
  person: Person;
  onPress: () => void;
  onToggleStar: () => void;
}

export function PersonCard({ person, onPress, onToggleStar }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const STATUS_COLORS: Record<string, string> = {
    Friend: Colors.accent,
    Dating: '#E84393',
    'Fellowship Contact': '#27AE60',
    Family: '#A0522D',
    Other: '#95A5A6',
  };

  const statusColor = STATUS_COLORS[person.status] ?? Colors.textLight;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.avatarWrapper}>
        {person.photoUri ? (
          <Image source={{ uri: person.photoUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{person.name[0]?.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{person.name}</Text>
        <View style={[styles.tag, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.tagText, { color: statusColor }]}>{person.status}</Text>
        </View>
        {person.lastInteraction && (
          <Text style={styles.meta}>Last contact: {person.lastInteraction}</Text>
        )}
      </View>
      <TouchableOpacity onPress={onToggleStar} style={styles.star} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
        <Ionicons
          name={person.starred ? 'star' : 'star-outline'}
          size={20}
          color={person.starred ? '#F39C12' : Colors.textLight}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.07,
      shadowRadius: 4,
      elevation: 2,
    },
    avatarWrapper: {
      marginRight: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    avatarPlaceholder: {
      backgroundColor: C.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontSize: 20,
      fontWeight: '700',
      color: C.primary,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: C.text,
      marginBottom: 4,
    },
    tag: {
      alignSelf: 'flex-start',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginBottom: 4,
    },
    tagText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    meta: {
      fontSize: 12,
      color: C.textLight,
    },
    star: {
      padding: 4,
    },
  });
}
