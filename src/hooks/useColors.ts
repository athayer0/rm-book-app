import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from './useSettings';
import { LightColors, DarkColors, type ColorPalette } from '../constants/colors';
import type { ThemeColorSettingKey } from '../constants/themeColorRows';
import { contrastInk, normalizeHex, withAlpha, lightenColor, darkenColor } from '../utils/colorUtils';

/**
 * Recomputes every palette entry the eleven THEME_COLOR_ROWS settings drive,
 * off of `base` (LightColors or DarkColors) and whatever `colors` supplies
 * for those eleven fields. Pulled out of `useColors` so OnboardingScreen can
 * call it with a *draft* set of colours instead of live settings — that's
 * what makes the whole onboarding flow repaint itself as a colour scheme is
 * picked, before anything is actually committed.
 */
export function applyThemeColorOverrides(
  base: ColorPalette,
  isDark: boolean,
  colors: Record<ThemeColorSettingKey, string>,
): ColorPalette {
  const primary = normalizeHex(colors.themeColor) ?? base.primary;
  const onPrimary = contrastInk(primary);
  const accent =
    normalizeHex(isDark ? colors.secondaryColorDark : colors.secondaryColorLight) ??
    base.accent;
  const control =
    normalizeHex(isDark ? colors.tertiaryColorDark : colors.tertiaryColorLight) ??
    base.control;
  const statusCompleted =
    normalizeHex(isDark ? colors.statusCompletedColorDark : colors.statusCompletedColorLight) ??
    base.statusCompleted;
  const statusFailed =
    normalizeHex(isDark ? colors.statusFailedColorDark : colors.statusFailedColorLight) ??
    base.statusFailed;
  const statusPending =
    normalizeHex(isDark ? colors.statusPendingColorDark : colors.statusPendingColorLight) ??
    base.statusPending;
  return {
    ...base,
    primary,
    onPrimary,
    onPrimaryMuted: withAlpha(onPrimary, 0.8),
    accent,
    control,
    statusCompleted,
    statusFailed,
    statusPending,
    // These three are hardcoded duplicates of `control`'s value in both
    // LightColors and DarkColors today — deriving them keeps every
    // navy-tinted surface (calendar day-selection border, goal-sheet "add a
    // thing" links, the selected-row tint) in step with the new setting.
    goalTextAction: control,
    selectedDayBorder: control,
    // The fill behind the selected day on the week strip. `base.selectedDayBg`
    // was hand-picked as a pale wash of the *default* tertiary colour — this
    // reproduces that same wash/dim relationship off whatever tertiary the
    // user actually has set, in each theme, instead of a value frozen at the
    // default. Amounts are tuned so a default tertiary reproduces the
    // original hardcoded hex almost exactly.
    selectedDayBg: isDark ? darkenColor(control, 0.7) : lightenColor(control, 0.87),
    rowSelectedBg: withAlpha(control, isDark ? 0.2 : 0.1),
  };
}

export function useColors(): ColorPalette {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && systemScheme === 'dark');

  // Memoised on the two inputs that can change it. Every component derives its
  // StyleSheet with `useMemo(..., [Colors])`, so handing back a fresh object each
  // render would rebuild every style in the tree on every render.
  return useMemo(
    () => applyThemeColorOverrides(isDark ? DarkColors : LightColors, isDark, settings),
    [
      isDark,
      settings.themeColor,
      settings.secondaryColorLight,
      settings.secondaryColorDark,
      settings.tertiaryColorLight,
      settings.tertiaryColorDark,
      settings.statusCompletedColorLight,
      settings.statusCompletedColorDark,
      settings.statusFailedColorLight,
      settings.statusFailedColorDark,
      settings.statusPendingColorLight,
      settings.statusPendingColorDark,
    ],
  );
}
