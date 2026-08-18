import React, { useRef, useState, useEffect, useMemo, useReducer } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, type View as ViewType } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { CalendarEvent, EventStatus, computeEventLayout } from '../utils/eventUtils';
import { EventBlock } from './EventBlock';
import { formatTime } from '../utils/dateUtils';
import { Svg, Polygon } from 'react-native-svg';
import { DEFAULT_SLOT_HEIGHT, EventSizes, DEFAULT_EVENT_SIZE } from '../constants/eventSizes';

const TIME_COL_WIDTH = 52;
const VERTICAL_EDGE_ZONE = 70;
const AUTOSCROLL_TICK_MS = 30;
const AUTOSCROLL_MIN_SPEED = 100; // px/sec, right at the zone boundary
const AUTOSCROLL_MAX_SPEED = 550; // px/sec, at the very edge

interface Props {
  events: CalendarEvent[];
  onEventPress?: (event: CalendarEvent) => void;
  onToggleStatus?: (event: CalendarEvent) => void;
  onTapEmpty: (timeStr: string) => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffsetY: number) => void;
  dragEventHeight?: number;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (absoluteY: number, gridTopY: number, scrollOffset: number) => void;
  onDragCancel?: () => void;
  dragHoverY?: number | null;
  dragGrabOffsetY?: number;
  // Extra drop-target shadows for a multi-select drag — one per selected event
  // other than the grabbed one, each given as its pixel offset from the grabbed
  // block's top edge plus its own rendered height. The grabbed block's shadow
  // comes from dragEventHeight, so the whole selection previews where it lands
  // regardless of which block the finger is actually holding.
  dragGroupShadows?: { id: string; offsetY: number; height: number }[];
  gridStartHour?: number;
  gridEndHour?: number;
  slotHeight?: number;
  eventFontSize?: number;
  getStatus?: (eventId: string, dateStr: string) => EventStatus | undefined;
  isToday?: boolean;
  // Shared vertical scroll: the center page publishes its offset via onScrollSettle;
  // side pages adopt it via syncScrollY (and initialScrollY on first layout) so every
  // day stays aligned to the same time-of-day.
  initialScrollY?: number;
  onScrollSettle?: (y: number) => void;
  syncScrollY?: number;
  // Multi-select: when active, tapping a block toggles it instead of opening the
  // editor, and only an already-selected block stays draggable (so a group of
  // selected blocks can be dragged as one, same as a single event).
  selectMode?: boolean;
  selectedEventIds?: Set<string>;
  onToggleEventSelect?: (event: CalendarEvent) => void;
}

function gridHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function TimeGrid({ events, onEventPress, onToggleStatus, onTapEmpty, onDragStart, onDragMove, onDragEnd, onDragCancel, dragHoverY, dragGrabOffsetY = 0, dragEventHeight, dragGroupShadows, gridStartHour = 6, gridEndHour = 22, slotHeight = DEFAULT_SLOT_HEIGHT, eventFontSize = EventSizes[DEFAULT_EVENT_SIZE].fontSize, getStatus, isToday = false, initialScrollY, onScrollSettle, syncScrollY, selectMode = false, selectedEventIds, onToggleEventSelect }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors, slotHeight), [Colors, slotHeight]);

  const SLOT_HEIGHT = slotHeight;
  const DRAG_SLOT_HEIGHT = slotHeight / 2;

  const HOURS = Array.from({ length: gridEndHour - gridStartHour + 1 }, (_, i) => gridStartHour + i);
  const totalHeight = (gridEndHour - gridStartHour) * SLOT_HEIGHT * 2;
  const scrollOffsetRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const gridRef = useRef<ViewType>(null);
  const gridTopAbsoluteRef = useRef(0);
  const viewportTopRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const dragHoverYRef = useRef<number | null>(null);
  const [, forceRerender] = useReducer((n) => n + 1, 0);

  // measure() reports where the grid currently sits on screen, which slides up as the
  // ScrollView scrolls. Normalise back to the unscrolled position, since the drag math
  // adds the live scroll offset in itself — otherwise the stored value is only correct
  // when captured at offset 0.
  function measureGridTop() {
    gridRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      gridTopAbsoluteRef.current = pageY + scrollOffsetRef.current;
    });
  }

  function measureViewport() {
    (scrollViewRef.current as unknown as ViewType | null)?.measure((_x: number, _y: number, _w: number, h: number, _pageX: number, pageY: number) => {
      viewportTopRef.current = pageY;
      viewportHeightRef.current = h;
    });
  }

  // Apply the shared vertical offset once, as soon as the ScrollView is laid out.
  const didInitScrollRef = useRef(false);
  function handleInitScroll() {
    if (didInitScrollRef.current) return;
    didInitScrollRef.current = true;
    if (initialScrollY != null && initialScrollY > 0) {
      scrollViewRef.current?.scrollTo({ y: initialScrollY, animated: false });
    }
  }

  // Side pages adopt the center page's offset whenever it changes.
  useEffect(() => {
    if (syncScrollY == null) return;
    scrollViewRef.current?.scrollTo({ y: syncScrollY, animated: false });
  }, [syncScrollY]);
  const [pressedSlot, setPressedSlot] = useState<number | null>(null);

  useEffect(() => {
    dragHoverYRef.current = dragHoverY ?? null;
  }, [dragHoverY]);

  function getVerticalEdgeZone(): 'top' | 'bottom' | null {
    if (dragHoverY == null) return null;
    if (dragHoverY < viewportTopRef.current + VERTICAL_EDGE_ZONE) return 'top';
    if (dragHoverY > viewportTopRef.current + viewportHeightRef.current - VERTICAL_EDGE_ZONE) return 'bottom';
    return null;
  }
  const verticalEdgeZone = getVerticalEdgeZone();

  useEffect(() => {
    if (verticalEdgeZone === null) return;
    const interval = setInterval(() => {
      const y = dragHoverYRef.current;
      if (y == null) return;
      const dir = verticalEdgeZone === 'top' ? -1 : 1;
      const distanceIntoZone = verticalEdgeZone === 'top'
        ? VERTICAL_EDGE_ZONE - (y - viewportTopRef.current)
        : VERTICAL_EDGE_ZONE - (viewportTopRef.current + viewportHeightRef.current - y);
      const proximity = Math.min(1, Math.max(0, distanceIntoZone / VERTICAL_EDGE_ZONE));
      const speed = AUTOSCROLL_MIN_SPEED + proximity * (AUTOSCROLL_MAX_SPEED - AUTOSCROLL_MIN_SPEED);
      const delta = dir * speed * (AUTOSCROLL_TICK_MS / 1000);
      const target = Math.max(0, scrollOffsetRef.current + delta);
      scrollViewRef.current?.scrollTo({ y: target, animated: false });
      forceRerender();
    }, AUTOSCROLL_TICK_MS);
    return () => clearInterval(interval);
  }, [verticalEdgeZone]);

  useEffect(() => {
    if (dragHoverY != null) setPressedSlot(null);
    if (dragHoverY == null) dragSlotHapticRef.current = null;
  }, [dragHoverY]);

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

  // Where the dragged block's top edge sits, in grid content coordinates.
  const dragSlot = dragHoverY != null
    ? Math.max(0, Math.floor((dragHoverY - dragGrabOffsetY - gridTopAbsoluteRef.current + scrollOffsetRef.current) / DRAG_SLOT_HEIGHT))
    : null;

  const dragSlotHapticRef = useRef<number | null>(null);

  // Re-measure as the drag begins rather than trusting the initial onLayout capture,
  // which can run before the surrounding layout has settled.
  function handleDragStart(event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffsetY: number) {
    measureGridTop();
    measureViewport();
    onDragStart?.(event, x, y, width, height, grabOffsetY);
  }

  function handleDragMove(x: number, y: number) {
    const slot = Math.max(0, Math.floor(
      (y - dragGrabOffsetY - gridTopAbsoluteRef.current + scrollOffsetRef.current) / DRAG_SLOT_HEIGHT
    ));
    if (slot !== dragSlotHapticRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      dragSlotHapticRef.current = slot;
    }
    onDragMove?.(x, y);
  }

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
  const HIDE_NEAR_PX = 6;
  const timeLabel = `${nowH % 12 || 12}:${String(nowM).padStart(2, '0')}`;

  function handleSlotTap(locationY: number) {
    // Tapping empty space already does nothing in select mode (onTapEmpty is a
    // no-op there) — the highlight and haptic would otherwise still fire for a
    // tap that visibly does nothing.
    if (selectMode) return;
    const maxSlot = (gridEndHour - gridStartHour) * 2 - 1;
    const slot = Math.min(maxSlot, Math.max(0, Math.floor((locationY - 16) / SLOT_HEIGHT)));
    setPressedSlot(slot);
    setTimeout(() => setPressedSlot(null), 500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTapEmpty(slotToTimeStr(slot));
  }

  return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onLayout={() => { measureViewport(); handleInitScroll(); }}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        onMomentumScrollEnd={(e) => onScrollSettle?.(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => onScrollSettle?.(e.nativeEvent.contentOffset.y)}
      >
        <View style={styles.grid}>
          <Pressable style={styles.timeCol} onPress={(e) => handleSlotTap(e.nativeEvent.locationY)}>
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
          </Pressable>

          <Pressable
            ref={gridRef}
            style={[styles.eventCol, { height: totalHeight }]}
            onLayout={measureGridTop}
            onPress={(e) => handleSlotTap(e.nativeEvent.locationY + 16)}
          >
            {showTimeIndicator && (
              <View
                pointerEvents="none"
                style={[styles.nowIndicator, { top: timeIndicatorY }]}
              >
                <View style={styles.nowRow}>
                  <View style={styles.nowLine} />
                  <Svg width={7} height={9} style={styles.nowTriangleSvg}>
                    <Polygon points="0,0 7,4.5 0,9" fill={Colors.primary} />
                  </Svg>
                </View>
                <Text style={styles.nowLabel}>{timeLabel}</Text>
              </View>
            )}

            {HOURS.map((hour, i) => (
              <View key={hour} style={[styles.fullLine, { top: i * SLOT_HEIGHT * 2 }]} />
            ))}

            {pressedSlot !== null && (
              <View
                pointerEvents="none"
                style={[styles.tapHighlight, { top: pressedSlot * SLOT_HEIGHT, height: SLOT_HEIGHT }]}
              />
            )}

            {dragSlot !== null && (
              <View
                pointerEvents="none"
                style={[styles.dragHighlight, { top: dragSlot * DRAG_SLOT_HEIGHT + 1, height: dragEventHeight ?? SLOT_HEIGHT }]}
              />
            )}

            {/* Siblings hold the pixel gap they started with, which is the same
                minute delta the drop replays off each one's own start time. */}
            {dragSlot !== null && dragGroupShadows?.map(shadow => (
              <View
                key={shadow.id}
                pointerEvents="none"
                style={[styles.dragHighlight, {
                  top: dragSlot * DRAG_SLOT_HEIGHT + 1 + shadow.offsetY,
                  height: shadow.height,
                }]}
              />
            ))}

            {events.map(event => {
              const { col, numCols } = eventLayout.get(event.id) ?? { col: 0, numCols: 1 };
              const isSelected = selectMode ? (selectedEventIds?.has(event.id) ?? false) : undefined;
              // Only a block already in the selection stays draggable, so a hold on
              // an unselected block just selects it instead of starting a move.
              const dragEnabled = onDragStart && (!selectMode || isSelected);
              return (
                <EventBlock
                  key={event.id + event.date}
                  event={event}
                  status={getStatus?.(event.id, event.date)}
                  gridStartHour={gridStartHour}
                  slotHeight={slotHeight}
                  fontSize={eventFontSize}
                  columnWidth={1 / numCols}
                  columnOffset={col / numCols}
                  selected={isSelected}
                  onPress={() => selectMode ? onToggleEventSelect?.(event) : onEventPress?.(event)}
                  onToggleStatus={onToggleStatus ? () => onToggleStatus(event) : undefined}
                  onDragStart={dragEnabled ? handleDragStart : undefined}
                  onDragMove={handleDragMove}
                  onDragEnd={onDragEnd ? (x, y) => onDragEnd(y, gridTopAbsoluteRef.current, scrollOffsetRef.current) : undefined}
                  onDragCancel={onDragCancel}
                />
              );
            })}
          </Pressable>
        </View>
      </ScrollView>
  );
}

function makeStyles(C: ColorPalette, SLOT_HEIGHT: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: C.card,
      marginTop: 6,
    },
    grid: {
      flexDirection: 'row',
      paddingBottom: 16,
    },
    timeCol: {
      width: TIME_COL_WIDTH,
      paddingTop: 11,
      paddingRight: 8,
    },
    hourLabel: {
      height: SLOT_HEIGHT * 2,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingRight: 8,
    },
    hourText: {
      fontSize: 11,
      color: C.textLight,
      fontWeight: '500',
      transform: [{ translateY: -6 }],
    },
    eventCol: {
      flex: 1,
      position: 'relative',
      marginTop: 16,
    },
    fullLine: {
      position: 'absolute',
      left: -8,
      right: 0,
      height: 1.5,
      backgroundColor: C.textLight,
      opacity: 0.3,
    },
    tapHighlight: {
      position: 'absolute',
      left: -TIME_COL_WIDTH,
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
      color: C.primary,
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
      backgroundColor: C.primary,
    },
    nowTriangleSvg: {
      position: 'absolute',
      left: 0,
      top: 0,
    },
  });
}
