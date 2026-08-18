import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { HAS_ONBOARDED_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';

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
 */
export function useOnboardingState(ready: boolean) {
  const { value: hasOnboarded, write, loaded } = useStoredState<boolean>(HAS_ONBOARDED_KEY, false);
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (ready && loaded && !hasOnboarded) setVisible(true);
  }, [ready, loaded, hasOnboarded]);

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
    write(() => true);
    setVisible(false);
    setFinishing(true);
  }, [write]);

  const finish = useCallback(() => setFinishing(false), []);

  const replay = useCallback(() => setVisible(true), []);

  return { visible, finishing, dismiss, finish, replay };
}
