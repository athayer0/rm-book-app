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

          const altBg = i % 2 === 0 ? '#E8E8E8' : '#D8D8D8';

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dayBtn,
                { backgroundColor: altBg },
                isDragTarget && styles.dayBtnDropZone,
                isSelected && styles.dayBtnSelected,
              ]}
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
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: '#E8E8E8',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayBtnSelected: {
    backgroundColor: '#ADD8E6',
    borderColor: '#00008B',
  },
  dayBtnDropZone: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  dayName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dayNameSelected: {
    color: '#00008B',
    fontWeight: '700',
  },
  dateNum: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  dateNumSelected: {
    color: '#00008B',
    fontWeight: '700',
  },
});
