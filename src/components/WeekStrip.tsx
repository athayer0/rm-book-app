import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { format, addDays, startOfWeek } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Props {
  selectedDate: Date;
  weekStart: 'monday' | 'sunday';
  onSelectDate: (date: Date) => void;
  onSwipeWeek: (dir: 1 | -1) => void;
}

export function WeekStrip({ selectedDate, weekStart, onSelectDate, onSwipeWeek }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const weekStartsOn = weekStart === 'monday' ? 1 : 0;
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const pendingResetRef = useRef(false);

  useLayoutEffect(() => {
    if (pendingResetRef.current) {
      pendingResetRef.current = false;
      translateX.setValue(-SCREEN_WIDTH);
    }
  }, [selectedDate]);

  function getDaysForWeekOf(date: Date) {
    const monday = startOfWeek(date, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  const prevDays = getDaysForWeekOf(addDays(selectedDate, -7));
  const currDays = getDaysForWeekOf(selectedDate);
  const nextDays = getDaysForWeekOf(addDays(selectedDate, 7));

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-15, 15])
    .runOnJS(true)
    .onUpdate((e) => {
      translateX.setValue(-SCREEN_WIDTH + e.translationX);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60) {
        const dir: 1 | -1 = e.translationX < 0 ? 1 : -1;
        const target = dir === 1 ? -SCREEN_WIDTH * 2 : 0;
        Animated.spring(translateX, {
          toValue: target,
          useNativeDriver: true,
          tension: 40,
          friction: 8,
        }).start(() => {
          pendingResetRef.current = true;
          onSwipeWeek(dir);
        });
      } else {
        Animated.spring(translateX, {
          toValue: -SCREEN_WIDTH,
          useNativeDriver: true,
          tension: 40,
          friction: 8,
        }).start();
      }
    });

  function renderWeek(days: Date[]) {
    return (
      <View style={{ width: SCREEN_WIDTH, flexDirection: 'row' }}>
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = dateStr === format(selectedDate, 'yyyy-MM-dd');
          const altBg = i % 2 === 0 ? Colors.weekStripBg : Colors.weekStripBgAlt;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dayBtn,
                { backgroundColor: altBg },
                isSelected && styles.dayBtnSelected,
              ]}
              onPress={() => onSelectDate(day)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                {format(day, 'EEE').slice(0, 2).toUpperCase()}
              </Text>
              <Text style={[styles.dateNum, isSelected && styles.dateNumSelected]}>
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.strip}>
        <Animated.View
          style={{
            flexDirection: 'row',
            width: SCREEN_WIDTH * 3,
            transform: [{ translateX }],
          }}
        >
          {renderWeek(prevDays)}
          {renderWeek(currDays)}
          {renderWeek(nextDays)}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    strip: {
      overflow: 'hidden',
      flexDirection: 'row',
      backgroundColor: C.weekStripBg,
    },
    dayBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 0,
      borderWidth: 2.4,
      borderColor: 'transparent',
    },
    dayBtnSelected: {
      backgroundColor: C.selectedDayBg,
      borderColor: C.selectedDayBorder,
    },
    dayName: {
      fontSize: 10,
      fontWeight: '600',
      color: C.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    dayNameSelected: {
      color: C.selectedDayBorder,
      fontWeight: '700',
    },
    dateNum: {
      fontSize: 15,
      fontWeight: '600',
      color: C.text,
    },
    dateNumSelected: {
      color: C.selectedDayBorder,
      fontWeight: '700',
    },
  });
}
