import React, { useRef, useLayoutEffect } from 'react';
import { ScrollView, View, Dimensions, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { format, addDays } from 'date-fns';

const SCREEN_WIDTH = Dimensions.get('window').width;

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
    const x = e.nativeEvent.contentOffset.x;
    if (x <= SCREEN_WIDTH * 0.5) {
      onChangeDate(-1);
    } else if (x >= SCREEN_WIDTH * 1.5) {
      onChangeDate(1);
    }
    // Settled back on the center page: nothing to do.
  }

  return (
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
      onMomentumScrollEnd={handleEnd}
      style={styles.pager}
    >
      <View style={styles.page}>{renderDay(prevStr, 'prev')}</View>
      <View style={styles.page}>{renderDay(currStr, 'current')}</View>
      <View style={styles.page}>{renderDay(nextStr, 'next')}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
  },
});
