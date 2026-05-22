import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { AppNavigation } from './src/navigation';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { drainQueue } from './src/lib/sync';
import { SettingsContext, useSettingsState } from './src/hooks/useSettings';

function AppRoot() {
  const { session, loading } = useAuth();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainQueue();
    });
    return unsubscribe;
  }, []);

  if (loading) return null;
  if (!session) return <AuthScreen />;
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
