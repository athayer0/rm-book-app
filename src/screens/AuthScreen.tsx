import React, { useState, useMemo } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

export function AuthScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>RM Book</Text>
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
  });
}
