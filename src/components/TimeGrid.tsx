import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../constants/colors';
import { CalendarEvent } from '../utils/eventUtils';
import { EventBlock } from './EventBlock';

const GRID_START = 6;
const GRID_END = 22;
const SLOT_HEIGHT = 50;
const HOURS = Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => GRID_START + i);
const TIME_COL_WIDTH = 52;

interface Props {
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
}

export function TimeGrid({ events, onEventPress }: Props) {
  const totalHeight = (GRID_END - GRID_START) * SLOT_HEIGHT * 2;

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.grid}>
        {/* Hour labels */}
        <View style={styles.timeCol}>
          {HOURS.map(hour => (
            <View key={hour} style={styles.hourLabel}>
              <Text style={styles.hourText}>
                {hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
              </Text>
            </View>
          ))}
        </View>

        {/* Event column */}
        <View style={[styles.eventCol, { height: totalHeight }]}>
          {/* Grid lines */}
          {HOURS.map((hour, i) => (
            <React.Fragment key={hour}>
              <View style={[styles.fullLine, { top: i * SLOT_HEIGHT * 2 }]} />
              <View style={[styles.halfLine, { top: i * SLOT_HEIGHT * 2 + SLOT_HEIGHT }]} />
            </React.Fragment>
          ))}

          {/* Events */}
          {events.map(event => (
            <EventBlock
              key={event.id + event.date}
              event={event}
              onPress={() => onEventPress(event)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  grid: {
    flexDirection: 'row',
    paddingBottom: 40,
  },
  timeCol: {
    width: TIME_COL_WIDTH,
    paddingRight: 8,
  },
  hourLabel: {
    height: SLOT_HEIGHT * 2,
    justifyContent: 'flex-start',
    paddingTop: 6,
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  hourText: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '500',
  },
  eventCol: {
    flex: 1,
    position: 'relative',
  },
  fullLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  halfLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
});
