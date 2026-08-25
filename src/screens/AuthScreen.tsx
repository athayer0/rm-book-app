import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useColorScheme,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleLogo } from '../components/GoogleLogo';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { signInWithProvider, type OAuthProvider } from '../lib/oauth';
import { useColors } from '../hooks/useColors';
import { useSettings } from '../hooks/useSettings';
import type { ColorPalette } from '../constants/colors';
import { AuthSkeleton } from '../components/AuthSkeleton';

const FOCUS_EASE = Easing.out(Easing.quad);
const BLUR_EASE = Easing.in(Easing.quad);

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
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  // Drives the border-color tween on each field's wrap — plain state would
  // swap the color in a single frame, which is the snap this replaces.
  const emailFocusAnim = useRef(new Animated.Value(0)).current;
  const passwordFocusAnim = useRef(new Animated.Value(0)).current;
  const animateFocus = (anim: Animated.Value, focused: boolean) => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: focused ? 180 : 220,
      easing: focused ? FOCUS_EASE : BLUR_EASE,
      useNativeDriver: false,
    }).start();
  };
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
        </View>
        <Text style={styles.title}>RM Calendar</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
        </Text>

        <View style={styles.card}>
          <Animated.View
            style={[
              styles.inputWrap,
              { borderColor: emailFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.inputBorder, Colors.primary] }) },
            ]}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.inputField}
              placeholder={t('auth.email')}
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => animateFocus(emailFocusAnim, true)}
              onBlur={() => animateFocus(emailFocusAnim, false)}
              value={email}
              onChangeText={setEmail}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.inputWrap,
              { borderColor: passwordFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.inputBorder, Colors.primary] }) },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              style={styles.inputField}
              placeholder={t('auth.password')}
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              onFocus={() => animateFocus(passwordFocusAnim, true)}
              onBlur={() => animateFocus(passwordFocusAnim, false)}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={Colors.textLight}
              />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.toggleWrap}
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
          activeOpacity={0.85}
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
            cornerRadius={12}
            style={styles.appleButton}
            onPress={() => handleOAuth('apple')}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
    },
    logoWrap: {
      alignItems: 'center',
      marginBottom: 16,
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.4,
      color: C.primary,
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      marginBottom: 28,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    inputIcon: {
      marginRight: 10,
    },
    inputField: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      color: C.text,
    },
    button: {
      backgroundColor: C.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 4,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
    buttonDisabled: {
      opacity: 0.75,
    },
    buttonText: {
      color: C.onPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    toggleWrap: {
      alignSelf: 'center',
      marginTop: 20,
      marginBottom: 4,
    },
    toggle: {
      color: C.control,
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '500',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 24,
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
      borderRadius: 12,
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
