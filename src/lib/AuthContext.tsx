import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearLocalData, ClearResult } from './localData';
import { drainQueue } from './sync';
import { peekQueue } from './syncQueue';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True from the moment signOut() or deleteAccount() is called until the session actually clears. */
  signingOut: boolean;
  /**
   * True once AuthScreen's reset-password code has been verified — that call
   * (supabase.auth.verifyOtp with type 'recovery') hands back a live session,
   * so App.tsx renders ResetPasswordScreen instead of the main app while this
   * is set, rather than letting a signed-in-but-still-on-the-old-password
   * session straight into the app.
   */
  passwordRecovery: boolean;
  /** Clears passwordRecovery once the user has set a new password, letting the already-valid session through to the app. */
  clearPasswordRecovery: () => void;
  signOut: () => Promise<ClearResult>;
  /** Deletes the account and every row it owns server-side, then signs out and wipes local data. */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signingOut: false,
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
  signOut: async () => ({ cleared: false, pending: 0 }),
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      // A stale/rotated refresh token rejects here. Clear it locally so we
      // don't retry the dead token on every boot.
      if (error) await supabase.auth.signOut();
      setSession(error ? null : data.session);
      setLoading(false);
    });

    // Supabase emits 'PASSWORD_RECOVERY' (alongside the session itself) the
    // moment AuthScreen's verifyOtp({ type: 'recovery' }) call succeeds —
    // catching it here, in the same callback that sets the session, is what
    // keeps the two in lockstep. Setting passwordRecovery any later (e.g.
    // chained after awaiting verifyOtp in AuthScreen) would risk a render
    // where session is already truthy but passwordRecovery isn't set yet,
    // flashing the main app before ResetPasswordScreen took over.
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async (): Promise<ClearResult> => {
    // Covers AppRoot's whole sign-out screen, not just the network call below
    // — see App.tsx, which renders a skeleton for as long as this is true
    // rather than leaving whatever screen was open on-screen and unresponsive
    // for the length of the drain + sign-out round trip.
    setSigningOut(true);
    try {
      // Push whatever's queued while the session is still valid — RLS requires
      // auth.uid() to match, so this has to run before supabase.auth.signOut().
      try {
        await drainQueue();
      } catch {
        // Offline, or the drain threw. Fall through to the queue check below.
      }
      const pending = (await peekQueue()).length;

      // Signed out of Supabase before the local wipe below, not after: AppRoot
      // reacts to the session going null (its `synced` flag drops) through this
      // same auth state change, so onboarding's "ready" gate has already closed
      // by the time clearLocalData() clears the settings row out from under it
      // — otherwise hasOnboarded reads transiently false while the app still
      // thinks it's signed in, and the welcome modal flashes on screen.
      await supabase.auth.signOut();

      // Local data is not namespaced per account, so it has to go before the next
      // user arrives. Only wipe once the push is confirmed — losing data that
      // exists nowhere else is worse than the account-bleed this prevents.
      if (pending > 0) return { cleared: false, pending };
      await clearLocalData();
      return { cleared: true, pending: 0 };
    } finally {
      setSigningOut(false);
      // Covers "cancel" from ResetPasswordScreen: without this, the now-null
      // session still reads as mid-recovery and App.tsx would keep showing
      // ResetPasswordScreen instead of falling through to AuthScreen.
      setPasswordRecovery(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    // Reuses signingOut's skeleton — deletion ends in the same signed-out
    // state, so there's no need for a second overlay flag in App.tsx.
    setSigningOut(true);
    try {
      // Deletes every row this account owns, then the auth.users row itself
      // — see delete_own_account() in supabase-schema.sql. Local queue state
      // doesn't matter here since the rows it would push are about to be
      // deleted server-side regardless.
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;
      await supabase.auth.signOut();
      await clearLocalData();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signingOut,
        passwordRecovery,
        clearPasswordRecovery: () => setPasswordRecovery(false),
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
