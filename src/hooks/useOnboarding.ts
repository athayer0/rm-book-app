import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSettings } from './useSettings';

type OnboardingContextValue = {
  replay: () => void;
  /** See useOnboardingFinishing(). */
  finishing: boolean;
};

// Default no-op so a screen rendered before AppRoot's provider mounts (there
// isn't one today, but nothing enforces that) doesn't crash on the call.
export const OnboardingContext = createContext<OnboardingContextValue>({
  replay: () => {},
  finishing: false,
});

/** Lets Settings retrigger the welcome flow without owning any of its state. */
export function useOnboardingReplay(): () => void {
  return useContext(OnboardingContext).replay;
}

/**
 * True from the moment "Get Started"/"Skip" is tapped until the writes that
 * commits (event type and goal definitions, the starter schedule, settings)
 * finish landing in the background. The onboarding modal itself is already
 * gone by then — Home reads this to show a skeleton in place of the goal
 * card instead of letting it visibly jitter as each write arrives.
 */
export function useOnboardingFinishing(): boolean {
  return useContext(OnboardingContext).finishing;
}

/**
 * Owns whether the welcome flow is on screen. `ready` gates the first-run
 * check on the same signal AppRoot uses to leave its splash screen, so
 * onboarding never appears over a loading spinner or a half-synced app.
 *
 * `hasOnboarded` lives in `settings` (synced per-account via Supabase), not a
 * device-local key — this is account state, not device state: onboarding
 * seeds real account data (starter event types, goals, settings), so signing
 * out and back in, or signing in on a second device, must not replay it.
 */
export function useOnboardingState(ready: boolean) {
  const { settings, updateSettings, loaded } = useSettings();
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    // Forced hidden whenever `ready` drops, not just left alone: sign-out
    // clears local settings (see AuthContext.signOut) before the session
    // itself updates, so `hasOnboarded` can go transiently false while
    // `ready` is still true. Without this branch `visible` latches true from
    // that instant and is never told to turn back off, so it carries straight
    // through into the next sign-in even once the real value comes back true.
    if (!ready) {
      setVisible(false);
      return;
    }
    if (loaded && !settings.hasOnboarded) setVisible(true);
  }, [ready, loaded, settings.hasOnboarded]);

  /**
   * Hides the modal and marks onboarding done immediately, without waiting
   * for the background writes OnboardingScreen's commitAndComplete is still
   * making — the wizard itself is finished the moment the user taps through.
   * `finishing` stays true until those writes actually land (see finish()).
   *
   * Navigating to Home is App.tsx's job, not this hook's — it already owns
   * `navigationRef`, and pulling it in here would import navigation.tsx from
   * a hook HomeScreen itself imports (for useOnboardingFinishing), circling
   * back on itself.
   */
  const dismiss = useCallback(() => {
    updateSettings({ hasOnboarded: true });
    setVisible(false);
    setFinishing(true);
  }, [updateSettings]);

  const finish = useCallback(() => setFinishing(false), []);

  const replay = useCallback(() => setVisible(true), []);

  return { visible, finishing, dismiss, finish, replay };
}
