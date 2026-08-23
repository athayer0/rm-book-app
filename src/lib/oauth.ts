import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export type OAuthProvider = 'google' | 'apple';

/** Resolves silently if the user cancels the native sign-in sheet. */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  if (provider === 'google') {
    await signInWithGoogle();
  } else {
    await signInWithApple();
  }
}

async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return;
    }
    throw err;
  }
  if (!isSuccessResponse(response)) {
    return;
  }

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google did not return an ID token.');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}

async function signInWithApple(): Promise<void> {
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') {
      return;
    }
    throw err;
  }

  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}
