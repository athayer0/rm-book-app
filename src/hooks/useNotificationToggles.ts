import { Alert } from 'react-native';
import { useSettings } from './useSettings';
import { requestNotificationPermissions, scheduleDailyReview, cancelDailyReview } from '../lib/notifications';

/**
 * Shared by SettingsScreen and the onboarding flow — both offer the same two
 * switches, and permission handling (request, alert on denial, schedule) must
 * not drift between the two places that turn them on.
 */
export function useNotificationToggles() {
  const { settings, updateSettings } = useSettings();

  // Requesting/scheduling here (rather than leaving it to App.tsx's settings-
  // driven effect alone) is what lets a denied permission stay off instead of
  // silently sitting "on" with nothing scheduled — the effect still runs too,
  // but by then permission is already resolved, so it's a no-op.
  async function toggleDailyReview(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications for RM Book in your device settings to use the daily review reminder.',
        );
        return;
      }
      await scheduleDailyReview(settings.dailyReviewHour, settings.dailyReviewMinute);
      updateSettings({ dailyReviewEnabled: true });
    } else {
      await cancelDailyReview();
      updateSettings({ dailyReviewEnabled: false });
    }
  }

  // Scheduling itself happens in App.tsx's settings-driven effect (it needs
  // the full event list). This just gates the permission request the same way
  // the daily review toggle does, so a denial leaves the switch off instead of
  // on with nothing scheduled.
  async function toggleEventReminders(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications for RM Book in your device settings to use event reminders.',
        );
        return;
      }
    }
    updateSettings({ eventReminderEnabled: value });
  }

  return { toggleDailyReview, toggleEventReminders };
}
