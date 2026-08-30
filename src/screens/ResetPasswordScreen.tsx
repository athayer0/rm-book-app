import React, { useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { authErrorMessage } from '../utils/authErrors';

/** Shown instead of the main app while AuthContext.passwordRecovery is set — see its comment for why. */
export function ResetPasswordScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { signOut, clearPasswordRecovery } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      Alert.alert(t('auth.enterNewPassword'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('auth.passwordsDontMatch'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('auth.passwordTooShort'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Alert.alert(t('auth.errorTitle'), authErrorMessage(error, t));
      return;
    }
    Alert.alert(t('auth.passwordUpdated'));
    clearPasswordRecovery();
  };

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
        <Text style={styles.title}>{t('auth.newPasswordTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.newPasswordSubtitle')}</Text>

        <View style={styles.card}>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.inputField}
              placeholder={t('auth.newPassword')}
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
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
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
            <TextInput
              ref={confirmRef}
              style={styles.inputField}
              placeholder={t('auth.confirmPassword')}
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.updatePassword')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.toggleWrap} onPress={() => signOut()}>
          <Text style={styles.toggle}>{t('common.cancel')}</Text>
        </TouchableOpacity>
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
      fontSize: 26,
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
  });
}
