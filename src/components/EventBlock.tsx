import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { CalendarEvent, EventStatus, TRACKABLE_TYPES, hasEventStartPassed, eventTopOffset, eventHeight } from '../utils/eventUtils';
import { Colors, EventTypeConfig } from '../constants/colors';
import { useDrag } from './DragContext';

const STATUS_CONFIG: Record<EventStatus, { color: string; icon: string }> = {
  completed: { color: '#1A7A40', icon: 'checkmark' },
  failed:    { color: '#B03030', icon: 'close' },
  pending:   { color: '#F39C12', icon: 'alert' },
};

interface Props {
  event: CalendarEvent;
  status?: EventStatus;
  onPress: () => void;
  onToggleComplete?: () => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDragCancel?: () => void;
  columnWidth?: number;
  columnOffset?: number;
  gridStartHour?: number;
}

export function EventBlock({
  event, status, onPress, onToggleComplete, onDragStart, onDragMove, onDragEnd, onDragCancel,
  columnWidth = 1, columnOffset = 0, gridStartHour = 6,
}: Props) {
  const { active, event: draggingEvent } = useDrag();
  const top = eventTopOffset(event.startTime, gridStartHour);
  const config = EventTypeConfig[event.type];
  const isFixed = config?.hasCheckbox ?? false;
  const height = Math.max(eventHeight(event.startTime, event.endTime), 25);
  const isBeingDragged = active && draggingEvent?.id === event.id;

  const isBackup = !!event.backup;
  const effectiveStatus: EventStatus | undefined = isBackup ? undefined : (
    status ?? (TRACKABLE_TYPES.has(event.type) && hasEventStartPassed(event) ? 'pending' : undefined)
  );

  const isDraggingRef = useRef(false);

  const dragGesture = Gesture.LongPress()
    .minDuration(400)
    .runOnJS(true)
    .onStart((e) => {
      isDraggingRef.current = true;
      onDragStart?.(event, e.absoluteX, e.absoluteY);
    })
    .simultaneousWithExternalGesture(Gesture.Pan());

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => { if (isBeingDragged) onDragMove?.(e.absoluteX, e.absoluteY); })
    .onEnd((e) => { if (isBeingDragged) onDragEnd?.(e.absoluteX, e.absoluteY); })
    .onFinalize((_e, success) => {
      // Use a ref instead of isBeingDragged here: onFinalize(false) can fire before
      // the setState from onDragStart propagates, so the React state is still stale.
      if (!success && isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragCancel?.();
      }
    });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => { if (success) onPress(); });

  const composed = Gesture.Race(
    Gesture.Simultaneous(dragGesture, panGesture),
    tapGesture,
  );

  const stripeCount = Math.ceil(height / 7) + 4;

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[
          styles.block,
          {
            top,
            height,
            backgroundColor: event.color + '70',
            borderLeftWidth: isBackup ? 0 : 3,
            borderLeftColor: isBackup ? 'transparent' : event.color,
            left: `${columnOffset * 100}%` as any,
            width: `${columnWidth * 100}%` as any,
            opacity: isBeingDragged ? 0.35 : 1,
            paddingLeft: isBackup ? 8 : 9,
            paddingRight: effectiveStatus ? 36 : 6,
          },
        ]}
        onStartShouldSetResponder={() => true}
      >
        {isBackup && (
          <View style={[styles.backupBar, { backgroundColor: event.color + '40', height }]}>
            {Array.from({ length: stripeCount }).map((_, i) => (
              <View
                key={i}
                style={[styles.backupStripe, { top: i * 7 - 5, backgroundColor: event.color }]}
              />
            ))}
          </View>
        )}

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

        {effectiveStatus && (
          <View style={styles.statusWrap}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[effectiveStatus].color }]}>
              <Ionicons
                name={STATUS_CONFIG[effectiveStatus].icon as any}
                size={11}
                color="#fff"
              />
            </View>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: 2,
    paddingLeft: 6,
    paddingRight: 6,
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
    flexShrink: 1,
  },
  time: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: 4,
    flexShrink: 0,
  },
  statusWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 12,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 4,
    overflow: 'hidden',
  },
  backupStripe: {
    position: 'absolute',
    left: -10,
    width: 24,
    height: 2.5,
    transform: [{ rotate: '-45deg' }],
  },
});
