import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Skeleton } from './Skeleton';

/**
 * Home's real content, redrawn as pulsing placeholders. Shown in place of the
 * goal card while onboarding's background writes (event types, goals, the
 * starter schedule) are still landing, so the grid doesn't visibly jitter as
 * each one arrives — see useOnboardingFinishing().
 *
 * Row counts (4 weekly, 1 monthly) match DEFAULT_GOALS' shipped counts (8
 * weekly, 2 monthly) at two cards per row, but this is still a representative
 * shape, not a promise: this is a few-hundred-millisecond transitional state,
 * so matching exactly what the user chose isn't worth the extra plumbing.
 */
export function HomeSkeleton() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <Skeleton width={120} height={17} borderRadius={4} />
          <Skeleton width={36} height={14} borderRadius={4} />
        </View>
        <SkeletonGrid rows={4} />

        <View style={[styles.header, styles.headerTightTop]}>
          <Skeleton width={130} height={17} borderRadius={4} />
        </View>
        <SkeletonGrid rows={1} />

        <View style={styles.actionRow}>
          <Skeleton height={41} borderRadius={14} style={styles.actionBtn} />
          <Skeleton height={41} borderRadius={14} style={styles.actionBtn} />
        </View>
      </View>

      <View style={styles.unreportedCard}>
        <Skeleton width={28} height={28} borderRadius={14} />
        <View style={styles.unreportedLabels}>
          <Skeleton width={140} height={15} borderRadius={4} />
          <Skeleton width={180} height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      </View>
    </>
  );
}

function SkeletonGrid({ rows }: { rows: number }) {
  return (
    <View style={gridStyles.container}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={gridStyles.row}>
          <Skeleton height={66} borderRadius={12} style={gridStyles.cell} />
          <Skeleton height={66} borderRadius={12} style={gridStyles.cell} />
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, margin: 4 },
});

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTightTop: { paddingTop: 11 },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
    },
    actionBtn: { flex: 1 },
    unreportedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    unreportedLabels: { flex: 1 },
  });
}
