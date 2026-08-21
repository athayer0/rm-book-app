import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { formatTime, parseTimeString, periodLabel } from '../utils/dateUtils';

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 5;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

// How many times a circular wheel's list is laid end to end so it can be
// scrolled past its "end" and land back at the start. Odd, so there's a
// middle copy to rest in, with equal spare copies buffering either side —
// enough that one flick, or several in a row before the silent recenter
// below catches up, can't run a short list (hours, minutes) off the edge.
const REPEAT = 9;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i); // 0-23
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // :00, :05, ... :55
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

interface WheelProps<T> {
  items: T[];
  value: T;
  renderLabel: (item: T) => string;
  onSettle: (item: T) => void;
  styles: ReturnType<typeof makeStyles>;
  /** Wraps past either end — hour and minute, but not AM/PM. */
  circular?: boolean;
}

// One spinning column. Uncontrolled while the user's finger is on it — a prop
// update mid-drag would fight the gesture — and only re-synced from `value`
// once the drag/momentum has finished.
//
// Circular columns render `items` repeated REPEAT times and always settle
// back onto the middle copy. The repeats either side are what let a flick
// cross the seam (55 -> 0, or 12 -> 1) instead of thudding into a hard stop;
// the recenter back to the middle copy is a plain jump (`animated: false`)
// onto a row showing the same value, so it reads as having kept spinning
// rather than as a reset.
function Wheel<T,>({ items, value, renderLabel, onSettle, styles, circular }: WheelProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const isTouching = useRef(false);
  const recenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.findIndex(i => i === value));
  const middleStart = circular ? Math.floor(REPEAT / 2) * items.length : 0;
  const displayItems = useMemo(
    () => (circular ? Array.from({ length: REPEAT }, () => items).flat() : items),
    [items, circular],
  );

  useEffect(() => {
    if (isTouching.current) return;
    scrollRef.current?.scrollTo({ y: (middleStart + index) * ITEM_HEIGHT, animated: false });
    // Only the initial mount and external value changes should move the wheel;
    // re-running this on every render would fight the user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => {
    if (recenterTimer.current) clearTimeout(recenterTimer.current);
  }, []);

  const settleAt = useCallback((y: number) => {
    const rawIdx = Math.max(0, Math.min(displayItems.length - 1, Math.round(y / ITEM_HEIGHT)));
    scrollRef.current?.scrollTo({ y: rawIdx * ITEM_HEIGHT, animated: true });
    const logical = ((rawIdx % items.length) + items.length) % items.length;
    const picked = items[logical];
    if (picked !== value) {
      Haptics.selectionAsync();
      onSettle(picked);
    }
    if (circular) {
      const canonicalIdx = middleStart + logical;
      if (canonicalIdx !== rawIdx) {
        // Waits out the snap animation above so it isn't cut short — the jump
        // itself is instant once it fires, landing on a row with the same
        // value the animation was already headed for.
        recenterTimer.current = setTimeout(() => {
          if (isTouching.current) return;
          scrollRef.current?.scrollTo({ y: canonicalIdx * ITEM_HEIGHT, animated: false });
        }, 300);
      }
    }
  }, [items, value, onSettle, circular, middleStart, displayItems.length]);

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={() => {
          isTouching.current = true;
          if (recenterTimer.current) clearTimeout(recenterTimer.current);
        }}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          isTouching.current = false;
          settleAt(e.nativeEvent.contentOffset.y);
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {displayItems.map((item, i) => (
          <View key={i} style={styles.wheelItem}>
            <Text style={[styles.wheelText, i % items.length === index && styles.wheelTextSelected]}>
              {renderLabel(item)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface Props {
  /** "9:05 AM" form — the same one every other time field in the app speaks. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * The classic spinner: hour, minute (in 5-minute steps), and — in 12-hour
 * mode — AM/PM. Hour and minute wrap continuously (55 rolls to 0, 12 rolls to
 * 1); AM/PM is only ever the two values, so it stays a bounded column. Each
 * column commits independently the moment it settles, so there's no separate
 * "Done" — closing the picker is the caller's job, same as the other inline
 * pickers in this form.
 *
 * Military time drops the AM/PM column and spins the hour wheel 0-23 instead
 * of 1-12 — the value it reads and writes is always the canonical "9:05 AM"
 * form regardless, same as everywhere else in the app (see displayTime).
 */
export function TimeWheelPicker({ value, onChange }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
  const is24h = settings.timeFormat === '24h';

  const { hour: hour24, minute } = parseTimeString(value);
  const hour12 = hour24 % 12 || 12;
  const period: 'AM' | 'PM' = hour24 < 12 ? 'AM' : 'PM';
  // Defensive only: the wheel itself always writes a multiple of 5, but a time
  // seeded elsewhere (a contact's real call time, old data) might not be.
  const roundedMinute = (Math.round(minute / 5) * 5) % 60;

  function commit12(h12: number, m: number, p: 'AM' | 'PM') {
    let h = h12 % 12;
    if (p === 'PM') h += 12;
    onChange(formatTime(h, m));
  }

  function commit24(h: number, m: number) {
    onChange(formatTime(h, m));
  }

  return (
    <View style={styles.panel}>
      <View style={styles.columns}>
        <View style={styles.selectionWindow} pointerEvents="none" />
        {is24h ? (
          <>
            <Wheel
              items={HOURS_24}
              value={hour24}
              renderLabel={h => String(h).padStart(2, '0')}
              onSettle={h => commit24(h, roundedMinute)}
              styles={styles}
              circular
            />
            <Wheel
              items={MINUTES}
              value={roundedMinute}
              renderLabel={m => String(m).padStart(2, '0')}
              onSettle={m => commit24(hour24, m)}
              styles={styles}
              circular
            />
          </>
        ) : (
          <>
            <Wheel
              items={HOURS_12}
              value={hour12}
              renderLabel={h => String(h)}
              onSettle={h => commit12(h, roundedMinute, period)}
              styles={styles}
              circular
            />
            <Wheel
              items={MINUTES}
              value={roundedMinute}
              renderLabel={m => String(m).padStart(2, '0')}
              onSettle={m => commit12(hour12, m, period)}
              styles={styles}
              circular
            />
            <Wheel
              items={PERIODS}
              value={period}
              renderLabel={p => periodLabel(p, settings.language)}
              onSettle={p => commit12(hour12, roundedMinute, p)}
              styles={styles}
            />
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    panel: {
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: C.card,
      overflow: 'hidden',
    },
    columns: {
      flexDirection: 'row',
      height: ITEM_HEIGHT * VISIBLE_ITEMS,
    },
    // Two hairlines bracketing the middle row, spanning every column — the
    // same "window" a native UIPickerView draws — rather than a fill, so the
    // row underneath still reads as part of the same list.
    selectionWindow: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: PAD,
      height: ITEM_HEIGHT,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      zIndex: 1,
    },
    wheel: { flex: 1 },
    wheelItem: {
      height: ITEM_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wheelText: { fontSize: 17, color: C.textLight },
    wheelTextSelected: { color: C.text, fontWeight: '700' },
  });
}
