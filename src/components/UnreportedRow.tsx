import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

interface Props {
  count: number;
  onPress: () => void;
}

/**
 * Home-screen shortcut into the unreported backlog.
 *
 * Stays visible at zero rather than unmounting: a row that vanishes takes its own
 * affordance with it, so there would be no way back in to check. The cleared
 * state carries the same weight of layout with a settled colour instead.
 */
export function UnreportedRow({ count, onPress }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const clear = count === 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={clear ? 'checkmark-circle' : 'alert-circle'}
        size={28}
        color={clear ? Colors.statusCompleted : Colors.statusPending}
      />

      <View style={styles.labels}>
        <Text style={styles.title}>{clear ? t('unreportedEvents.allCaughtUp') : t('unreportedEvents.title')}</Text>
        <Text style={styles.subtitle}>
          {clear
            ? t('unreportedRow.nothingWaiting')
            : t('unreportedRow.eventsWaiting', { count })}
        </Text>
      </View>

      {!clear && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}

      <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
    </TouchableOpacity>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 16,
      // Matches the goal card either side of it.
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    labels: {
      flex: 1,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
    },
    subtitle: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },
    badge: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.statusPending,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '700',
      color: C.white,
    },
  });
}
