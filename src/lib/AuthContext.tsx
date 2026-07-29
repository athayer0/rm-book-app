import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { drainThenClear, ClearResult } from './localData';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<ClearResult>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => ({ cleared: false, pending: 0 }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data, error }) => {
      // A stale/rotated refresh token rejects here. Clear it locally so we
      // don't retry the dead token on every boot.
      if (error) await supabase.auth.signOut();
      setSession(error ? null : data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async (): Promise<ClearResult> => {
    // Local data is not namespaced per account, so it has to go before the next
    // user arrives. Sign out regardless of whether the clear succeeded — but
    // report back, so the UI can say the data was kept and why.
    const result = await drainThenClear();
    await supabase.auth.signOut();
    return result;
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
