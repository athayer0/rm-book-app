import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { ScrollView, View, Dimensions, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { format, addDays } from 'date-fns';

const SCREEN_WIDTH = Dimensions.get('window').width;
// After a committed swipe settles, keep the day grid frozen for this long so a rapid
// re-swipe can't move it (matches the pager's commit → recenter cadence, the real load limiter).
const SWIPE_COOLDOWN_MS = 250;
// Fallback unlock if onMomentumScrollEnd never fires after a drag (e.g. zero-velocity release).
const LOCK_SAFETY_MS = 600;

type Role = 'prev' | 'current' | 'next';

interface Props {
  selectedDate: Date;
  onChangeDate: (dir: 1 | -1) => void;
  scrollEnabled?: boolean;
  renderDay: (dateStr: string, role: Role) => React.ReactNode;
}

/**
 * A horizontal, native-paging day carousel. Three full-width pages
 * (prev / current / next) are always mounted and the pager rests on the center
 * page. A swipe to a neighbor commits the new day via `onChangeDate`, then a
 * layout-effect silently recenters back to the middle page — an "infinite pager".
 *
 * Native paging supplies the snap/flick physics, so there is no custom animation.
 * Keeping the neighbor pages mounted means their events are already laid out, so a
 * swipe reveals them instantly.
 */
export function DayPager({ selectedDate, onChangeDate, scrollEnabled = true, renderDay }: Props) {
  const pagerRef = useRef<ScrollView>(null);
  const [locked, setLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null; }
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
  }

  useEffect(() => clearTimers, []);

  // Finger lifted: freeze the grid immediately (overlay) so a fast re-swipe can't grab the
  // still-settling pager. onMomentumScrollEnd will decide when to unlock.
  function handleScrollEndDrag() {
    setLocked(true);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => setLocked(false), LOCK_SAFETY_MS);
  }

  const prevStr = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const currStr = format(selectedDate, 'yyyy-MM-dd');
  const nextStr = format(addDays(selectedDate, 1), 'yyyy-MM-dd');

  function recenter(animated: boolean) {
    pagerRef.current?.scrollTo({ x: SCREEN_WIDTH, y: 0, animated });
  }

  // After any day commit, snap back to the center page before paint so the newly
  // centered day and the reset offset appear together (no flash at the wrong offset).
  useLayoutEffect(() => {
    recenter(false);
  }, [selectedDate]);

  function handleEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
    const x = e.nativeEvent.contentOffset.x;
    const committed = x <= SCREEN_WIDTH * 0.5 || x >= SCREEN_WIDTH * 1.5;
    if (committed) {
      onChangeDate(x <= SCREEN_WIDTH * 0.5 ? -1 : 1);
      // Hold the freeze for the cooldown, timed from the moment the page settles.
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => setLocked(false), SWIPE_COOLDOWN_MS);
    } else {
      // Settled back on the center page: no day change, release immediately.
      clearTimers();
      setLocked(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={scrollEnabled}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        disableIntervalMomentum
        contentOffset={{ x: SCREEN_WIDTH, y: 0 }}
        onLayout={() => recenter(false)}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleEnd}
        style={styles.pager}
      >
        <View style={styles.page}>{renderDay(prevStr, 'prev')}</View>
        <View style={styles.page}>{renderDay(currStr, 'current')}</View>
        <View style={styles.page}>{renderDay(nextStr, 'next')}</View>
      </ScrollView>

      {/* While frozen, this overlay captures every touch so nothing in the grid moves.
          It only blocks touches — the native snap and imperative recenter continue underneath. */}
      {locked && (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
});
