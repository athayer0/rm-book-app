import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from './useSettings';
import { LightColors, DarkColors, type ColorPalette } from '../constants/colors';
import { contrastInk, normalizeHex, withAlpha } from '../utils/colorUtils';

export function useColors(): ColorPalette {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && systemScheme === 'dark');

  // Memoised on the two inputs that can change it. Every component derives its
  // StyleSheet with `useMemo(..., [Colors])`, so handing back a fresh object each
  // render would rebuild every style in the tree on every render.
  return useMemo(() => {
    const base = isDark ? DarkColors : LightColors;
    const primary = normalizeHex(settings.themeColor) ?? base.primary;
    const onPrimary = contrastInk(primary);
    const accent =
      normalizeHex(isDark ? settings.secondaryColorDark : settings.secondaryColorLight) ??
      base.accent;
    const control =
      normalizeHex(isDark ? settings.tertiaryColorDark : settings.tertiaryColorLight) ??
      base.control;
    return {
      ...base,
      primary,
      onPrimary,
      onPrimaryMuted: withAlpha(onPrimary, 0.8),
      accent,
      control,
      // These three are hardcoded duplicates of `control`'s value in both
      // LightColors and DarkColors today — deriving them keeps every
      // navy-tinted surface (calendar day-selection border, goal-sheet "add a
      // thing" links, the selected-row tint) in step with the new setting.
      goalTextAction: control,
      selectedDayBorder: control,
      rowSelectedBg: withAlpha(control, isDark ? 0.2 : 0.1),
    };
  }, [
    isDark,
    settings.themeColor,
    settings.secondaryColorLight,
    settings.secondaryColorDark,
    settings.tertiaryColorLight,
    settings.tertiaryColorDark,
  ]);
}
