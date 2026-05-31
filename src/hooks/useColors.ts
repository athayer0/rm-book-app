import { useColorScheme } from 'react-native';
import { useSettings } from './useSettings';
import { LightColors, DarkColors } from '../constants/colors';

export function useColors() {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && systemScheme === 'dark');
  return isDark ? DarkColors : LightColors;
}
