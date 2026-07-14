import { useColorScheme } from 'react-native';
import { useSettings } from './useSettings';

export function useIsDark(): boolean {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  return settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');
}
