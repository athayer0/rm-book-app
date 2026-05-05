import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CalendarEvent } from '../utils/eventUtils';
import { eventTopOffset, eventHeight } from '../utils/eventUtils';
import { Colors } from '../constants/colors';

interface Props {
  event: CalendarEvent;
  onPress: () => void;
  columnWidth?: number;
  columnOffset?: number;
}

export function EventBlock({ event, onPress, columnWidth = 1, columnOffset = 0 }: Props) {
  const top = eventTopOffset(event.startTime, 6);
  const height = Math.max(eventHeight(event.startTime, event.endTime), 30);

  return (
    <TouchableOpacity
      style={[
        styles.block,
        {
          top,
          height,
          backgroundColor: event.color + 'CC',
          borderLeftColor: event.color,
          left: `${columnOffset * 100}%` as any,
          width: `${columnWidth * 100}%` as any,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
      <Text style={styles.time} numberOfLines={1}>{event.startTime} – {event.endTime}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  time: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
