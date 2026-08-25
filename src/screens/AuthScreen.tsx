import React, { useState, useMemo, useEffect } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useColorScheme,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleLogo } from '../components/GoogleLogo';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { signInWithProvider, type OAuthProvider } from '../lib/oauth';
import { useColors } from '../hooks/useColors';
import { useSettings } from '../hooks/useSettings';
import type { ColorPalette } from '../constants/colors';
import { AuthSkeleton } from '../components/AuthSkeleton';

export function AuthScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { settings } = useSettings();
  const systemScheme = useColorScheme();
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // isAvailableAsync() is the one piece of this screen's first paint that
  // isn't ready synchronously — without gating on it, the Apple button pops
  // in a beat after everything else and shifts what's below it. Non-iOS never
  // runs the check, so it starts already "checked" there.
  const [appleChecked, setAppleChecked] = useState(Platform.OS !== 'ios');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then((available) => {
        setAppleAvailable(available);
        setAppleChecked(true);
      });
    }
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert(t('auth.enterEmailPassword'));
      return;
    }
    setLoading(true);
    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await fn;
    setLoading(false);

    if (error) {
      Alert.alert(t('auth.errorTitle'), error.message);
    } else if (mode === 'signup') {
      Alert.alert(t('auth.checkEmailConfirmation'));
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    // No loading UI on these buttons (per design) — this guard is only to
    // stop a double-tap from opening two native sign-in sheets at once, not
    // to drive any visual state.
    if (oauthLoading) return;
    setOauthLoading(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      Alert.alert(t('auth.errorTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setOauthLoading(null);
    }
  };

  if (!appleChecked) return <AuthSkeleton />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>RM Calendar</Text>
      <Text style={styles.subtitle}>
        {mode === 'signin' ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('auth.email')}
        placeholderTextColor={Colors.textLight}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('auth.password')}
        placeholderTextColor={Colors.textLight}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            {mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        <Text style={styles.toggle}>
          {mode === 'signin'
            ? t('auth.needAccount')
            : t('auth.haveAccount')}
        </Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.oauthButton}
        onPress={() => handleOAuth('google')}
      >
        <GoogleLogo size={18} style={styles.oauthIcon} />
        <Text style={styles.oauthButtonText}>{t('auth.continueWithGoogle')}</Text>
      </TouchableOpacity>

      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={10}
          style={styles.appleButton}
          onPress={() => handleOAuth('apple')}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: 'center',
      padding: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: C.primary,
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: C.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
    },
    input: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      color: C.text,
      marginBottom: 12,
    },
    button: {
      backgroundColor: C.primary,
      borderRadius: 10,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    buttonText: {
      color: C.onPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    toggle: {
      color: C.control,
      textAlign: 'center',
      fontSize: 14,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 28,
      marginBottom: 16,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
    },
    dividerText: {
      color: C.textLight,
      fontSize: 13,
      marginHorizontal: 12,
    },
    // Google's own button spec, not the app's theme — see the googleButton*
    // token comments in constants/colors.ts.
    oauthButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.googleButtonBg,
      borderWidth: 1,
      borderColor: C.googleButtonBorder,
      borderRadius: 10,
      padding: 14,
      marginBottom: 12,
    },
    oauthIcon: {
      marginRight: 10,
    },
    appleButton: {
      height: 50,
      marginBottom: 12,
    },
    oauthButtonText: {
      color: C.googleButtonText,
      fontSize: 16,
      fontWeight: '500',
    },
  });
}
