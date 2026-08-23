import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { HomeSkeleton } from './HomeSkeleton';
import { TAB_BAR_HEIGHT } from '../constants/layout';

/** Mirrors navigation.tsx's tab icons/order — Home is drawn focused, since that's always where this hands off to. */
const TAB_ICONS: { name: string; focused: string; unfocused: string }[] = [
  { name: 'Home', focused: 'home', unfocused: 'home-outline' },
  { name: 'Calendar', focused: 'calendar', unfocused: 'calendar-outline' },
  { name: 'People', focused: 'people', unfocused: 'people-outline' },
  { name: 'Settings', focused: 'settings', unfocused: 'settings-outline' },
];

/**
 * Shown in place of a bare spinner while the post-sign-in sync (`pullAll`) is
 * still running — see AppRoot's `!synced` gate in App.tsx. Home's own header
 * chrome around HomeSkeleton, the same placeholder HomeScreen shows itself
 * while onboarding's background writes are still landing (see
 * useOnboardingFinishing()) — reused here since Home is where sign-in always
 * lands, so previewing its shape reads as "getting there" rather than a
 * content-free spinner.
 *
 * The tab bar below is a static repaint of navigation.tsx's real one (which
 * doesn't exist yet — AppNavigation isn't mounted during this gate), not a
 * live component, so it has no navigation of its own; it's here purely so
 * the screen doesn't look tab-bar-less compared to every other screen.
 */
export function HomeLoadingScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    // Top edge only: the static tab bar below accounts for the bottom inset
    // itself (its paddingBottom below), the same way react-navigation does
    // for the real one — padding it here too would double it up.
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('home.title')}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <HomeSkeleton />
      </ScrollView>
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        {TAB_ICONS.map(({ name, focused, unfocused }) => {
          const isHome = name === 'Home';
          return (
            <View
              key={name}
              style={[styles.tabIconWrap, { backgroundColor: isHome ? Colors.primary : 'transparent' }]}
            >
              <Ionicons
                name={(isHome ? focused : unfocused) as any}
                size={22}
                color={isHome ? Colors.onPrimary : Colors.tabBarInactive}
              />
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: C.onPrimary,
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 28,
      gap: 16,
    },
    // Matches navigation.tsx's tabBarStyle/tabBarIcon exactly, minus the
    // paddingBottom there (react-navigation adds the inset itself; here
    // that's folded into the inline paddingBottom above instead).
    tabBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: C.tabBar,
      borderTopColor: C.border,
      borderTopWidth: 1,
      paddingTop: 10,
      minHeight: TAB_BAR_HEIGHT,
    },
    tabIconWrap: {
      width: 56,
      height: 34,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
