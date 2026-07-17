import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

function getMonthGrid(month: Date, weekStart: 'monday' | 'sunday'): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const weekStartsOn = weekStart === 'monday' ? 1 : 0;
  let startDow = firstDay.getDay();
  if (weekStartsOn === 1) startDow = (startDow + 6) % 7;
  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let d = 0; d < daysInMonth; d++) cells.push(addDays(firstDay, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

interface Props {
  /** Selected date, yyyy-MM-dd. */
  value: string;
  onChange: (dateStr: string) => void;
  weekStart: 'monday' | 'sunday';
  /** Dates before this are not selectable, yyyy-MM-dd. */
  minDate?: string;
}

export function InlineDatePicker({ value, onChange, weekStart, minDate }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [pickerMonth, setPickerMonth] = useState(() => new Date(value + 'T12:00:00'));

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{format(pickerMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity
          onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayHeaders}>
        {(weekStart === 'monday'
          ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
          : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
        ).map(day => <Text key={day} style={styles.dayHeader}>{day}</Text>)}
      </View>

      {getMonthGrid(pickerMonth, weekStart).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.dayCell} />;
            const ds = format(day, 'yyyy-MM-dd');
            const isSelected = ds === value;
            const isToday = ds === todayStr;
            const disabled = !!minDate && ds < minDate;
            return (
              <TouchableOpacity
                key={di}
                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                onPress={() => onChange(ds)}
                disabled={disabled}
              >
                <Text style={[
                  styles.dayText,
                  isToday && !isSelected && styles.dayTextToday,
                  isSelected && styles.dayTextSelected,
                  disabled && styles.dayTextDisabled,
                ]}>
                  {format(day, 'd')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
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
      padding: 8,
      backgroundColor: C.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    navBtn: { padding: 6 },
    monthTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    dayHeaders: { flexDirection: 'row', marginBottom: 4 },
    dayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: C.textLight },
    week: { flexDirection: 'row' },
    dayCell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
    dayCellSelected: { backgroundColor: C.primary, borderRadius: 18 },
    dayText: { fontSize: 13, color: C.text },
    dayTextToday: { color: C.primary, fontWeight: '700' },
    dayTextSelected: { color: C.white, fontWeight: '700' },
    dayTextDisabled: { color: C.textLight, opacity: 0.4 },
  });
}
