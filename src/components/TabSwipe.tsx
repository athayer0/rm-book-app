import React from 'react';
import { View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState, useRoute } from '@react-navigation/native';

/** How far the finger must travel horizontally to commit to the next tab. */
const COMMIT_PX = 60;

/**
 * Horizontal swipe between adjacent tabs.
 *
 * Finger-left advances to the next tab, matching the day/week swipe in
 * WeekStrip — the two gestures live a thumb-width apart on the calendar, so
 * they have to agree on which way is forward.
 *
 * Tab order comes from the navigator's own `routeNames` rather than a list kept
 * here: reordering <Tab.Screen> would otherwise silently leave this pointing at
 * the wrong neighbours, and a swipe landing on the wrong tab is the kind of bug
 * that reads as a gesture misfire rather than stale data.
 *
 * CalendarScreen deliberately opts out (see navigation.tsx). Its own horizontal
 * pan owns day navigation, so wrapping it would make every day-swipe a race
 * between changing the day and leaving the screen. That exemption is what makes
 * the calendar a one-way destination: reachable by swipe from either side,
 * escapable only through the tab bar.
 */
export function TabSwipe({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const routeNames = useNavigationState(state => state.routeNames);
  const index = routeNames.indexOf(route.name);

  const swipe = Gesture.Pan()
    // Same thresholds as WeekStrip: a generous X activation with a tight Y
    // bail-out, so a vertical scroll on these screens never reads as a tab
    // change. Both are needed — every screen using this wraps a ScrollView.
    .activeOffsetX([-30, 30])
    .failOffsetY([-15, 15])
    .runOnJS(true)
    .onEnd(e => {
      if (index < 0 || Math.abs(e.translationX) < COMMIT_PX) return;
      // No wrap-around: the first tab has nothing to its left and the last
      // nothing to its right, so an overshoot is a no-op rather than a jump
      // across the whole tab bar.
      const target = routeNames[index + (e.translationX < 0 ? 1 : -1)];
      if (target) navigation.navigate(target);
    });

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}

/**
 * Screen wrapper, applied at the navigator rather than inside each screen so
 * that which tabs swipe stays one visible decision next to the tab list.
 *
 * Must be called at module scope. Wrapping inside a render would produce a new
 * component type every pass and remount the screen — losing its scroll position
 * and modal state on each parent render.
 */
export function withTabSwipe<P extends object>(Screen: React.ComponentType<P>) {
  return function TabSwipeScreen(props: P) {
    return (
      <TabSwipe>
        <Screen {...props} />
      </TabSwipe>
    );
  };
}
