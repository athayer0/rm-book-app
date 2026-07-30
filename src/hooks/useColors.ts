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
    return {
      ...base,
      primary,
      onPrimary,
      onPrimaryMuted: withAlpha(onPrimary, 0.8),
    };
  }, [isDark, settings.themeColor]);
}
