import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { AppNavigation } from './src/navigation';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { supabase } from './src/lib/supabase';
import { drainQueue, pullAll, startAutoDrain } from './src/lib/sync';
import { peekQueue } from './src/lib/syncQueue';
import { SettingsContext, useSettingsState } from './src/hooks/useSettings';

/** How long to wait on the initial sync before showing the app anyway. */
const SYNC_TIMEOUT_MS = 8000;

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}

function AppRoot() {
  const { session, user, loading } = useAuth();
  const [synced, setSynced] = useState(false);

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

  if (loading) return null;
  if (!session) return <AuthScreen />;
  if (!synced) return <Splash />;
  return <AppNavigation />;
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
