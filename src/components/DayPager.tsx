import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { ScrollView, View, Dimensions, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { format, addDays, differenceInCalendarDays } from 'date-fns';

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

  function computeTriple(d: Date) {
    return {
      prev: format(addDays(d, -1), 'yyyy-MM-dd'),
      curr: format(d, 'yyyy-MM-dd'),
      next: format(addDays(d, 1), 'yyyy-MM-dd'),
    };
  }

  // The three page slots' own content, independent of `selectedDate` — see the
  // effect below for why. Initialized to match selectedDate on mount.
  const [pageDates, setPageDates] = useState(() => computeTriple(selectedDate));
  const lastDateRef = useRef(selectedDate);
  const deferredRafRef = useRef<[number, number] | null>(null);

  function clearDeferredRaf() {
    if (deferredRafRef.current) {
      cancelAnimationFrame(deferredRafRef.current[0]);
      cancelAnimationFrame(deferredRafRef.current[1]);
      deferredRafRef.current = null;
    }
  }

  useEffect(() => clearDeferredRaf, []);

  // Runs `fn` two frames out (long enough for the `scrollTo({ animated: false })`
  // above to actually land — it isn't synchronous with this commit) and tracks
  // both frame ids so a fresh commit before that can cancel it.
  function deferTwoFrames(fn: () => void) {
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        deferredRafRef.current = null;
        fn();
      });
      deferredRafRef.current = [id1, id2];
    });
    deferredRafRef.current = [id1, id1];
  }

  function recenter(animated: boolean) {
    pagerRef.current?.scrollTo({ x: SCREEN_WIDTH, y: 0, animated });
  }

  // After any day commit, snap back to the center page before paint so the newly
  // centered day and the reset offset appear together (no flash at the wrong offset).
  //
  // A committed swipe lands on the neighbor page (index 0 or 2) while that page's
  // content is still the *old* prev/next value — which already equals the new
  // center day, so relabeling it 'current' needs no content change. The opposite
  // edge (the page going from center to the far side) does need new content, but
  // it's the page still sitting on screen until `scrollTo` actually finishes — and
  // that scroll isn't synchronous with this commit despite `animated: false`, so
  // swapping its content now is exactly the flash this is fixing. That page keeps
  // its old (still-correct, matches what's already on screen) content until a
  // couple of frames after the recenter, once it's safely off-screen.
  useLayoutEffect(() => {
    const deltaDays = differenceInCalendarDays(selectedDate, lastDateRef.current);
    lastDateRef.current = selectedDate;
    clearDeferredRaf();

    if (deltaDays === 1) {
      setPageDates(pd => ({ prev: pd.curr, curr: pd.next, next: pd.next }));
      recenter(false);
      deferTwoFrames(() => {
        setPageDates(pd => ({ ...pd, next: format(addDays(selectedDate, 1), 'yyyy-MM-dd') }));
      });
    } else if (deltaDays === -1) {
      setPageDates(pd => ({ next: pd.curr, curr: pd.prev, prev: pd.prev }));
      recenter(false);
      deferTwoFrames(() => {
        setPageDates(pd => ({ ...pd, prev: format(addDays(selectedDate, -1), 'yyyy-MM-dd') }));
      });
    } else {
      // Not an adjacent-day step (today button, month picker, week swipe, a
      // notification jump) — no neighbor page already holds the right content,
      // and the pager isn't mid-gesture, so there's no continuity to protect.
      setPageDates(computeTriple(selectedDate));
      recenter(false);
    }
  }, [selectedDate]);

  const { prev: prevStr, curr: currStr, next: nextStr } = pageDates;

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
        bounces={false}
        overScrollMode="never"
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
