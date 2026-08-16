import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { AppNavigation, navigationRef } from './src/navigation';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { supabase } from './src/lib/supabase';
import { drainQueue, pullAll, startAutoDrain } from './src/lib/sync';
import { peekQueue } from './src/lib/syncQueue';
import { SettingsContext, useSettings, useSettingsState } from './src/hooks/useSettings';
import { OnboardingContext, useOnboardingState } from './src/hooks/useOnboarding';
import { useCalendarEvents } from './src/hooks/useCalendarEvents';
import {
  requestNotificationPermissions, scheduleDailyReview, cancelDailyReview, isDailyReviewResponse,
  syncEventReminders, clearEventReminders, eventReminderResponseData,
} from './src/lib/notifications';

/** How long to wait on the initial sync before showing the app anyway. */
const SYNC_TIMEOUT_MS = 8000;

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

function openUnreportedFromNotification() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Home', { openUnreported: true });
  }
}

function openDayFromNotification(date: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Calendar', { eventDate: date });
  }
}

/** Dispatches a tapped notification to whichever screen it belongs on. */
function handleNotificationResponse(response: Notifications.NotificationResponse) {
  if (isDailyReviewResponse(response)) {
    openUnreportedFromNotification();
    return;
  }
  const eventReminder = eventReminderResponseData(response);
  if (eventReminder) openDayFromNotification(eventReminder.date);
}

function AppRoot() {
  const { session, user, loading } = useAuth();
  const { settings, loaded: settingsLoaded } = useSettings();
  const { events } = useCalendarEvents();
  const [synced, setSynced] = useState(false);
  const onboarding = useOnboardingState(synced);

  // Push anything queued, then pull the server's copy down. Screens adopt the
  // pulled data through the storage subscriptions, so this gate is only here to
  // avoid a visible flash of stale data — it is not load-bearing for correctness.
  useEffect(() => {
    if (!user) {
      setSynced(false);
      return;
    }
    let cancelled = false;
    // Never block the app indefinitely: offline with a large queue would
    // otherwise be a blank screen indistinguishable from a crash.
    const timer = setTimeout(() => {
      if (!cancelled) setSynced(true);
    }, SYNC_TIMEOUT_MS);

    (async () => {
      try {
        console.log('[sync] queued ops:', (await peekQueue()).length);
        await drainQueue();
        console.log('[sync] after drain, still queued:', (await peekQueue()).length);
        await pullAll(user.id);
      } catch (e) {
        // Offline or the pull failed: fall through to whatever is cached locally.
        // last_synced_at stays uncommitted, so the next launch retries.
        console.log('[sync] failed:', e);
      }
      if (!cancelled) setSynced(true);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainQueue();
    });
    return unsubscribe;
  }, []);

  // Push a few seconds after writes stop, so a change made mid-session doesn't
  // sit on the device until the next launch.
  useEffect(() => {
    if (!user) return;
    return startAutoDrain();
  }, [user?.id]);

  // Supabase requires autoRefreshToken to be tied to foreground/background in
  // React Native, otherwise the refresh timer fires while backgrounded.
  useEffect(() => {
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, []);

  // Catch up on returning to the app. Push first so local work is safe, then
  // pull so this device isn't editing against a stale copy — a device that has
  // only been backgrounded never re-runs the sign-in sync, so without this it
  // could sit on days-old data and overwrite another device's newer rows the
  // moment you touched anything.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', async state => {
      if (state !== 'active') return;
      try {
        await drainQueue();
        await pullAll(user.id);
      } catch (e) {
        console.log('[sync] foreground sync failed:', e);
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  // Reconciles the OS-level schedule to match `settings` — the single source
  // of truth, per this app's local-first design. Runs on every relevant
  // settings change, so it covers the Settings screen toggle as well as the
  // row arriving from another device via sync (each device must call the OS
  // API itself; there is nothing to push here). Permission denial is handled
  // silently here — the Settings screen's own toggle handler is what gives
  // the user feedback for that.
  useEffect(() => {
    if (!settingsLoaded) return;
    (async () => {
      if (settings.dailyReviewEnabled) {
        const granted = await requestNotificationPermissions();
        if (granted) await scheduleDailyReview(settings.dailyReviewHour, settings.dailyReviewMinute);
      } else {
        await cancelDailyReview();
      }
    })();
  }, [settingsLoaded, settings.dailyReviewEnabled, settings.dailyReviewHour, settings.dailyReviewMinute]);

  // Same reconciliation as above, but for the rolling window of per-event
  // reminders (see syncEventReminders' own comment for why it's a window
  // rather than the whole series). Re-runs on every foreground too, since
  // that's the only way the window advances when the app just sits idle —
  // nothing about `events` or `settings` changes as days pass on their own.
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;

    async function sync() {
      if (settings.eventReminderEnabled) {
        const granted = await requestNotificationPermissions();
        if (cancelled) return;
        if (granted) await syncEventReminders(events, settings.eventReminderMinutes);
        else await clearEventReminders();
      } else {
        await clearEventReminders();
      }
    }
    sync();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [settingsLoaded, settings.eventReminderEnabled, settings.eventReminderMinutes, events]);

  // Tapped while backgrounded or foregrounded: the navigator is already
  // mounted, so the ref is ready immediately.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  // Tapped while the app was killed: the tap is what launches the app, so the
  // ref isn't ready until AppNavigation has mounted — wait for `synced`.
  useEffect(() => {
    if (!synced) return;
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(response);
    });
  }, [synced]);

  if (loading) return null;
  if (!session) return <AuthScreen />;
  if (!synced) return <Splash />;
  return (
    <OnboardingContext.Provider value={{ replay: onboarding.replay }}>
      <AppNavigation />
      <OnboardingScreen visible={onboarding.visible} onComplete={onboarding.complete} />
    </OnboardingContext.Provider>
  );
}

function SettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useSettingsState();
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <SettingsProvider>
            <AppRoot />
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
