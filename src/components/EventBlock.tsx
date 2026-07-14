import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CalendarEvent, EventStatus, TRACKABLE_TYPES, hasEventStartPassed, eventTopOffset, eventHeight } from '../utils/eventUtils';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventTypeConfig } from '../constants/colors';
import { useDrag } from './DragContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COL_WIDTH = 52;

const STATUS_CONFIG: Record<EventStatus, { color: string; icon: string }> = {
  completed: { color: '#1A7A40', icon: 'checkmark-circle' },
  failed:    { color: '#B03030', icon: 'ban' },
  pending:   { color: '#F39C12', icon: 'alert-circle' },
};

interface Props {
  event: CalendarEvent;
  status?: EventStatus;
  onPress: () => void;
  onToggleComplete?: () => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number, width: number, height: number) => void;
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
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { active, event: draggingEvent } = useDrag();
  const top = eventTopOffset(event.startTime, gridStartHour) + 1;
  const config = EventTypeConfig[event.type];
  const isFixed = config?.hasCheckbox ?? false;
  const height = Math.max(eventHeight(event.startTime, event.endTime) - 1, 24);
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const dragPixelWidth = columnWidth * (SCREEN_WIDTH - TIME_COL_WIDTH);
      onDragStart?.(event, e.absoluteX, e.absoluteY, dragPixelWidth, height);
    })
    .simultaneousWithExternalGesture(Gesture.Pan());

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => { if (isBeingDragged) onDragMove?.(e.absoluteX, e.absoluteY); })
    .onEnd((e) => { if (isBeingDragged) onDragEnd?.(e.absoluteX, e.absoluteY); })
    .onFinalize((_e, success) => {
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
            borderLeftWidth: isBackup ? 0 : 3,
            borderLeftColor: isBackup ? 'transparent' : event.color,
            left: `${columnOffset * 100}%` as any,
            width: `${columnWidth * 100}%` as any,
            opacity: isBeingDragged ? 0 : 1,
            paddingLeft: isBackup ? 8 : 9,
            paddingRight: effectiveStatus ? 42 : 6,
          },
        ]}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.blockTint, { backgroundColor: event.color + '35' }]} />
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
            {effectiveStatus === 'failed' ? (
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: STATUS_CONFIG.failed.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ban-outline" size={26} color={Colors.white} style={{ transform: [{ scaleX: -1 }] }} />
              </View>
            ) : effectiveStatus === 'completed' ? (
              <View style={{ width: 36, height: 36 }}>
                <View style={{ position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.card, top: 6, left: 6 }} />
                <Ionicons name="checkmark-circle" size={36} color={STATUS_CONFIG.completed.color} />
              </View>
            ) : (
              <View style={{ width: 36, height: 36 }}>
                <View style={{ position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.card, top: 6, left: 6 }} />
                <Ionicons name="alert-circle" size={36} color={STATUS_CONFIG.pending.color} />
              </View>
            )}
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    block: {
      position: 'absolute',
      borderLeftWidth: 3,
      borderRadius: 2,
      paddingLeft: 6,
      paddingRight: 6,
      paddingVertical: 3,
      overflow: 'hidden',
      backgroundColor: C.card,
    },
    blockTint: {
      ...StyleSheet.absoluteFillObject,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkbox: {
      marginRight: 4,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    time: {
      fontSize: 13,
      color: C.textSecondary,
      marginLeft: 4,
      flexShrink: 0,
    },
    statusWrap: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 6,
      width: 36,
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
}
