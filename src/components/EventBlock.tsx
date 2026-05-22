import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { CalendarEvent } from '../utils/eventUtils';
import { eventTopOffset, eventHeight } from '../utils/eventUtils';
import { Colors, EventTypeConfig } from '../constants/colors';
import { useDrag } from './DragContext';

interface Props {
  event: CalendarEvent;
  onPress: () => void;
  onToggleComplete?: () => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  columnWidth?: number;
  columnOffset?: number;
  gridStartHour?: number;
}

export function EventBlock({
  event, onPress, onToggleComplete, onDragStart, onDragMove, onDragEnd,
  columnWidth = 1, columnOffset = 0, gridStartHour = 6,
}: Props) {
  const { active, event: draggingEvent } = useDrag();
  const top = eventTopOffset(event.startTime, gridStartHour);
  const config = EventTypeConfig[event.type];
  const isFixed = config?.hasCheckbox ?? false;
  const height = Math.max(eventHeight(event.startTime, event.endTime), 25);
  const isBeingDragged = active && draggingEvent?.id === event.id;

  // Long press activates drag; pan while holding tracks movement
  const dragGesture = Gesture.LongPress()
    .minDuration(400)
    .runOnJS(true)
    .onStart((e) => onDragStart?.(event, e.absoluteX, e.absoluteY))
    .simultaneousWithExternalGesture(Gesture.Pan());

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => { if (isBeingDragged) onDragMove?.(e.absoluteX, e.absoluteY); })
    .onEnd((e) => { if (isBeingDragged) onDragEnd?.(e.absoluteX, e.absoluteY); });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => { if (success) onPress(); });

  const composed = Gesture.Race(
    Gesture.Simultaneous(dragGesture, panGesture),
    tapGesture,
  );

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[
          styles.block,
          {
            top,
            height,
            backgroundColor: event.color + '70',
            borderLeftColor: event.color,
            left: `${columnOffset * 100}%` as any,
            width: `${columnWidth * 100}%` as any,
            opacity: isBeingDragged ? 0.35 : 1,
          },
        ]}
      >
        <View style={styles.row}>
          {isFixed && (
            <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(() => onToggleComplete?.())}>
              <View hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons
                  name={event.completed ? 'checkbox' : 'checkbox-outline'}
                  size={13}
                  color={Colors.text}
                  style={styles.checkbox}
                />
              </View>
            </GestureDetector>
          )}
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.time} numberOfLines={1}>
            {isFixed ? event.startTime : `${event.startTime} – ${event.endTime}`}
          </Text>
        </View>
      </View>
    </GestureDetector>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  time: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: 4,
    flexShrink: 1,
  },
});
