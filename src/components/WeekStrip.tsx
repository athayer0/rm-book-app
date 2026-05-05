import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { format, addDays, subDays } from 'date-fns';
import { Colors } from '../constants/colors';

interface Props {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export function WeekStrip({ selectedDate, onSelectDate }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(subDays(selectedDate, 3), i));
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  return (
    <View style={styles.strip}>
      {days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const isSelected = dateStr === format(selectedDate, 'yyyy-MM-dd');
        const isToday = dateStr === todayStr;

        return (
          <TouchableOpacity
            key={dateStr}
            style={[styles.dayBtn, isSelected && styles.dayBtnSelected]}
            onPress={() => onSelectDate(day)}
            activeOpacity={0.8}
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
  dayBtnSelected: {
    // visual handled by circle
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
