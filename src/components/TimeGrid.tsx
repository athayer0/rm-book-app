import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, type View as ViewType } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Colors } from '../constants/colors';
import { CalendarEvent, EventStatus, computeEventLayout } from '../utils/eventUtils';
import { EventBlock } from './EventBlock';
import { formatTime } from '../utils/dateUtils';

const SLOT_HEIGHT = 50;
const TIME_COL_WIDTH = 52;

interface Props {
  events: CalendarEvent[];
  onEventPress?: (event: CalendarEvent) => void;
  onToggleComplete?: (id: string) => void;
  onTapEmpty: (timeStr: string) => void;
  onSwipeDay: (dir: 1 | -1) => void;
  onSwipeProgress?: (x: number) => void;
  onSwipeCancel?: () => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (absoluteY: number, gridTopY: number, scrollOffset: number) => void;
  onDragCancel?: () => void;
  dragHoverY?: number | null;
  dragActive?: boolean;
  gridStartHour?: number;
  gridEndHour?: number;
  initialScrollY?: number;
  restoreKey?: string;
  onScrollChange?: (y: number) => void;
  getStatus?: (eventId: string, dateStr: string) => EventStatus | undefined;
}

function gridHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function TimeGrid({ events, onEventPress, onToggleComplete, onTapEmpty, onSwipeDay, onSwipeProgress, onSwipeCancel, onDragStart, onDragMove, onDragEnd, onDragCancel, dragHoverY, dragActive, gridStartHour = 6, gridEndHour = 22, initialScrollY, restoreKey, onScrollChange, getStatus }: Props) {
  const HOURS = Array.from({ length: gridEndHour - gridStartHour + 1 }, (_, i) => gridStartHour + i);
  const totalHeight = (gridEndHour - gridStartHour) * SLOT_HEIGHT * 2;
  const scrollOffsetRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const gridRef = useRef<ViewType>(null);
  const gridTopAbsoluteRef = useRef(0);

  function measureGridTop() {
    gridRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      gridTopAbsoluteRef.current = pageY;
    });
  }
  const [pressedSlot, setPressedSlot] = useState<number | null>(null);

  useEffect(() => {
    if (dragHoverY != null) setPressedSlot(null);
  }, [dragHoverY]);

  useEffect(() => {
    if (initialScrollY != null && initialScrollY > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: initialScrollY, animated: false });
      });
    }
  }, [restoreKey]);

  const dragSlot = dragHoverY != null
    ? Math.max(0, Math.floor((dragHoverY - gridTopAbsoluteRef.current + scrollOffsetRef.current) / SLOT_HEIGHT))
    : null;

  function slotToTimeStr(slot: number): string {
    const hour = Math.floor(slot / 2) + gridStartHour;
    const minute = (slot % 2) * 30;
    return formatTime(Math.min(hour, 23), minute);
  }

  const eventLayout = computeEventLayout(events);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-15, 15])
    .enabled(!dragActive)
    .runOnJS(true)
    .onUpdate((e) => {
      onSwipeProgress?.(e.translationX);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60) {
        onSwipeDay(e.translationX < 0 ? 1 : -1);
      } else {
        onSwipeCancel?.();
      }
    });

  return (
    <GestureDetector gesture={swipeGesture}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          onScrollChange?.(e.nativeEvent.contentOffset.y);
        }}
      >
        <View style={styles.grid}>
          {/* Hour labels */}
          <View style={styles.timeCol}>
            {HOURS.map(hour => (
              <View key={hour} style={styles.hourLabel}>
                <Text style={styles.hourText}>
                  {gridHourLabel(hour)}
                </Text>
              </View>
            ))}
          </View>

          {/* Event column */}
          <Pressable
            ref={gridRef}
            style={[styles.eventCol, { height: totalHeight }]}
            onLayout={measureGridTop}
            onPressIn={(e) => setPressedSlot(Math.floor(e.nativeEvent.locationY / SLOT_HEIGHT))}
            onPressOut={() => setPressedSlot(null)}
            onPress={(e) => onTapEmpty(slotToTimeStr(Math.floor(e.nativeEvent.locationY / SLOT_HEIGHT)))}
          >
            {/* Grid lines */}
            {HOURS.map((hour, i) => (
              <React.Fragment key={hour}>
                <View style={[styles.fullLine, { top: i * SLOT_HEIGHT * 2 }]} />
                {i < HOURS.length - 1 && (
                  <View style={[styles.halfLine, { top: i * SLOT_HEIGHT * 2 + SLOT_HEIGHT }]} />
                )}
              </React.Fragment>
            ))}

            {/* Tap highlight */}
            {pressedSlot !== null && (
              <View
                pointerEvents="none"
                style={[styles.tapHighlight, { top: pressedSlot * SLOT_HEIGHT, height: SLOT_HEIGHT }]}
              />
            )}

            {/* Drag hover highlight */}
            {dragSlot !== null && (
              <View
                pointerEvents="none"
                style={[styles.dragHighlight, { top: dragSlot * SLOT_HEIGHT, height: SLOT_HEIGHT }]}
              />
            )}

            {/* Events */}
            {events.map(event => {
              const { col, numCols } = eventLayout.get(event.id) ?? { col: 0, numCols: 1 };
              return (
                <EventBlock
                  key={event.id + event.date}
                  event={event}
                  status={getStatus?.(event.id, event.date)}
                  gridStartHour={gridStartHour}
                  columnWidth={1 / numCols}
                  columnOffset={col / numCols}
                  onPress={() => onEventPress?.(event)}
                  onToggleComplete={onToggleComplete ? () => onToggleComplete(event.id) : undefined}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd ? (x, y) => onDragEnd(y, gridTopAbsoluteRef.current, scrollOffsetRef.current) : undefined}
                  onDragCancel={onDragCancel}
                />
              );
            })}
          </Pressable>
        </View>
      </ScrollView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  grid: {
    flexDirection: 'row',
    paddingBottom: 16,
  },
  timeCol: {
    width: TIME_COL_WIDTH,
    paddingTop: 16,
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
    transform: [{ translateY: -12 }],
  },
  eventCol: {
    flex: 1,
    position: 'relative',
    marginTop: 28,
  },
  fullLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.textLight,
    opacity: 0.2,
  },
  halfLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.textLight,
    opacity: 0.1,
  },
  tapHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.accent + '25',
  },
  dragHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.accent + '35',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.accent + '80',
  },
});
