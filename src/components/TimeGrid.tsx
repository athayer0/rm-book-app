import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, type View as ViewType } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Colors } from '../constants/colors';
import { CalendarEvent, EventStatus, computeEventLayout } from '../utils/eventUtils';
import { EventBlock } from './EventBlock';
import { formatTime } from '../utils/dateUtils';
import { Svg, Polygon } from 'react-native-svg';

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
  isToday?: boolean;
}

function gridHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function TimeGrid({ events, onEventPress, onToggleComplete, onTapEmpty, onSwipeDay, onSwipeProgress, onSwipeCancel, onDragStart, onDragMove, onDragEnd, onDragCancel, dragHoverY, dragActive, gridStartHour = 6, gridEndHour = 22, initialScrollY, restoreKey, onScrollChange, getStatus, isToday = false }: Props) {
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

  // Current time indicator
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  useEffect(() => {
    if (initialScrollY != null && initialScrollY > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: initialScrollY, animated: false });
      });
    }
  }, [restoreKey]);

  const dragSlot = dragHoverY != null
    ? Math.max(0, Math.floor((dragHoverY - SLOT_HEIGHT - gridTopAbsoluteRef.current + scrollOffsetRef.current) / SLOT_HEIGHT))
    : null;

  function slotToTimeStr(slot: number): string {
    const hour = Math.floor(slot / 2) + gridStartHour;
    const minute = (slot % 2) * 30;
    return formatTime(Math.min(hour, 23), minute);
  }

  const eventLayout = computeEventLayout(events);

  const nowH = Math.floor(currentMinutes / 60);
  const nowM = currentMinutes % 60;
  const timeIndicatorY = (currentMinutes - gridStartHour * 60) / 60 * SLOT_HEIGHT * 2;
  const showTimeIndicator = isToday && nowH >= gridStartHour && nowH < gridEndHour;
  // Hide the hour label whose grid line the red indicator is close to
  const HIDE_NEAR_PX = 6;
  const timeLabel = `${nowH % 12 || 12}:${String(nowM).padStart(2, '0')}`;

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
            {HOURS.map((hour, i) => {
              const hourLineY = i * SLOT_HEIGHT * 2;
              const nearIndicator = showTimeIndicator && Math.abs(timeIndicatorY - hourLineY) <= HIDE_NEAR_PX;
              return (
                <View key={hour} style={styles.hourLabel}>
                  <Text style={[styles.hourText, nearIndicator && { opacity: 0 }]}>
                    {gridHourLabel(hour)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Event column */}
          <Pressable
            ref={gridRef}
            style={[styles.eventCol, { height: totalHeight }]}
            onLayout={measureGridTop}
            onPress={(e) => {
              const slot = Math.floor(e.nativeEvent.locationY / SLOT_HEIGHT);
              setPressedSlot(slot);
              setTimeout(() => setPressedSlot(null), 500);
              onTapEmpty(slotToTimeStr(slot));
            }}
          >
            {/* Current time indicator — rendered first so events paint on top */}
            {showTimeIndicator && (
              <View
                pointerEvents="none"
                style={[styles.nowIndicator, { top: timeIndicatorY }]}
              >
                {/* nowRow is first child → its top edge is exactly at timeIndicatorY */}
                <View style={styles.nowRow}>
                  {/* Line behind — spans full width */}
                  <View style={styles.nowLine} />
                  {/* Triangle on top — rendered after so it paints over the line */}
                  <Svg width={7} height={9} style={styles.nowTriangleSvg}>
                    <Polygon points="0,0 7,4.5 0,9" fill="#000000" />
                  </Svg>
                </View>
                {/* Label floats above the line without pushing it down */}
                <Text style={styles.nowLabel}>{timeLabel}</Text>
              </View>
            )}

            {/* Grid lines — hour marks only */}
            {HOURS.map((hour, i) => (
              <View key={hour} style={[styles.fullLine, { top: i * SLOT_HEIGHT * 2 }]} />
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
    transform: [{ translateY: -6 }],
  },
  eventCol: {
    flex: 1,
    position: 'relative',
    marginTop: 28,
  },
  fullLine: {
    position: 'absolute',
    left: -8,
    right: 0,
    height: 1.5,
    backgroundColor: Colors.textLight,
    opacity: 0.3,
  },
  tapHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(160,160,160,0.2)',
  },
  dragHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(160,160,160,0.2)',
  },
  nowIndicator: {
    position: 'absolute',
    left: -TIME_COL_WIDTH,
    right: 0,
  },
  nowLabel: {
    position: 'absolute',
    top: -15,
    left: 6,
    fontSize: 11,
    fontWeight: '500',
    color: Colors.primary,
  },
  nowRow: {
    position: 'relative',
    height: 9,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3.5,
    height: 2,
    backgroundColor: Colors.primary,
  },
  nowTriangleSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
