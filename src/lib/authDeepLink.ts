import { supabase } from './supabase';

/**
 * Registered as this app's `scheme` in app.json, so iOS/Android hand a link
 * starting with this prefix straight to the app instead of opening a
 * browser. Passed to signUp() as the PKCE redirect target.
 */
export const AUTH_CALLBACK_URL = 'compi://auth-callback';

/**
 * Completes the PKCE code exchange for a link that redirected back into the
 * app (currently: email signup confirmation) via AUTH_CALLBACK_URL. Supabase
 * sets the resulting session on the client, which AuthContext's own
 * onAuthStateChange listener picks up — nothing here needs to touch session
 * state directly.
 */
export async function handleAuthRedirect(url: string | null): Promise<void> {
  if (!url || !url.startsWith(AUTH_CALLBACK_URL)) return;
  const { error } = await supabase.auth.exchangeCodeForSession(url);
  if (error) throw error;
}
