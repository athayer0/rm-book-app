import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Skeleton } from './Skeleton';

/**
 * AuthScreen, redrawn as pulsing placeholders — shown for as long as
 * AuthContext's signOut() is running (see AppRoot's `signingOut` gate in
 * App.tsx), so the screen that was open when "Sign Out" was tapped doesn't
 * just sit there unresponsive for the drain + sign-out round trip. Mirrors
 * AuthScreen's own layout/spacing so it reads as a preview of what's coming,
 * not an unrelated loading screen.
 */
export function AuthSkeleton() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.container}>
      <Skeleton width={140} height={34} borderRadius={8} style={styles.title} />
      <Skeleton width={210} height={18} borderRadius={4} style={styles.subtitle} />

      <Skeleton height={48} borderRadius={10} style={styles.field} />
      <Skeleton height={48} borderRadius={10} style={styles.field} />

      <Skeleton height={48} borderRadius={10} style={styles.button} />

      <Skeleton width={220} height={15} borderRadius={4} style={styles.toggle} />

      <View style={styles.dividerRow}>
        <Skeleton height={1} style={styles.dividerLine} />
        <Skeleton width={20} height={13} borderRadius={4} />
        <Skeleton height={1} style={styles.dividerLine} />
      </View>

      <Skeleton height={48} borderRadius={10} style={styles.oauthButton} />
      <Skeleton height={48} borderRadius={10} style={styles.oauthButton} />
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: 'center',
      padding: 24,
    },
    title: { alignSelf: 'center', marginBottom: 8 },
    subtitle: { alignSelf: 'center', marginBottom: 32 },
    field: { marginBottom: 12 },
    button: { marginTop: 8, marginBottom: 16 },
    toggle: { alignSelf: 'center' },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 28,
      marginBottom: 16,
    },
    dividerLine: { flex: 1 },
    oauthButton: { marginBottom: 12 },
  });
}
