import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { format, addDays, startOfWeek } from 'date-fns';
import { Colors } from '../constants/colors';
import { CalendarEvent } from '../utils/eventUtils';

interface Props {
  selectedDate: Date;
  weekStart: 'monday' | 'sunday';
  onSelectDate: (date: Date) => void;
  onSwipeWeek: (dir: 1 | -1) => void;
  draggingEvent?: CalendarEvent | null;
  onDayDrop?: (date: Date) => void;
}

export function WeekStrip({ selectedDate, weekStart, onSelectDate, onSwipeWeek, draggingEvent, onDayDrop }: Props) {
  const weekStartsOn = weekStart === 'monday' ? 1 : 0;
  const monday = startOfWeek(selectedDate, { weekStartsOn });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Track x positions of each day cell for drop detection
  const cellLayouts = useRef<{ x: number; width: number; date: Date }[]>([]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-15, 15])
    .runOnJS(true)
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60) {
        onSwipeWeek(e.translationX < 0 ? 1 : -1);
      }
    });

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.strip}>
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = dateStr === format(selectedDate, 'yyyy-MM-dd');
          const isToday = dateStr === todayStr;
          const isDragTarget = !!draggingEvent;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.dayBtn, isDragTarget && styles.dayBtnDropZone, isSelected && styles.dayBtnSelected]}
              onPress={() => onSelectDate(day)}
              activeOpacity={0.8}
              onLayout={(e) => {
                cellLayouts.current[i] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                  date: day,
                };
              }}
            >
              <Text style={[styles.dayName, isSelected && styles.textSelected]}>
                {format(day, 'EEE').slice(0, 2).toUpperCase()}
              </Text>
              <View style={[
                styles.dateCircle,
                isSelected && styles.dateCircleSelected,
                isToday && !isSelected && styles.dateCircleToday,
              ]}>
                <Text style={[
                  styles.dateNum,
                  isSelected && styles.textSelected,
                  isToday && !isSelected && styles.textToday,
                ]}>
                  {format(day, 'd')}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayBtnSelected: {},
  dayBtnDropZone: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleSelected: {
    backgroundColor: Colors.accent,
  },
  dateCircleToday: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  dateNum: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  textSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  textToday: {
    color: Colors.white,
  },
});
