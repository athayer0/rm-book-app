import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { HAS_ONBOARDED_KEY } from '../constants/storageKeys';
import { useStoredState } from './useStoredState';

type OnboardingContextValue = {
  replay: () => void;
};

// Default no-op so a screen rendered before AppRoot's provider mounts (there
// isn't one today, but nothing enforces that) doesn't crash on the call.
export const OnboardingContext = createContext<OnboardingContextValue>({
  replay: () => {},
});

/** Lets Settings retrigger the welcome flow without owning any of its state. */
export function useOnboardingReplay(): () => void {
  return useContext(OnboardingContext).replay;
}

/**
 * Owns whether the welcome flow is on screen. `ready` gates the first-run
 * check on the same signal AppRoot uses to leave its splash screen, so
 * onboarding never appears over a loading spinner or a half-synced app.
 */
export function useOnboardingState(ready: boolean) {
  const { value: hasOnboarded, write, loaded } = useStoredState<boolean>(HAS_ONBOARDED_KEY, false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ready && loaded && !hasOnboarded) setVisible(true);
  }, [ready, loaded, hasOnboarded]);

  const complete = useCallback(() => {
    write(() => true);
    setVisible(false);
  }, [write]);

  const replay = useCallback(() => setVisible(true), []);

  return { visible, complete, replay };
}
