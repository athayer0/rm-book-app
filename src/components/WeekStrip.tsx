import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { format, addDays, startOfWeek } from 'date-fns';
import { Colors } from '../constants/colors';
interface Props {
  selectedDate: Date;
  weekStart: 'monday' | 'sunday';
  onSelectDate: (date: Date) => void;
  onSwipeWeek: (dir: 1 | -1) => void;
}

export function WeekStrip({ selectedDate, weekStart, onSelectDate, onSwipeWeek }: Props) {
  const weekStartsOn = weekStart === 'monday' ? 1 : 0;
  const monday = startOfWeek(selectedDate, { weekStartsOn });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

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

          const altBg = i % 2 === 0 ? '#E8E8E8' : '#D8D8D8';

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
