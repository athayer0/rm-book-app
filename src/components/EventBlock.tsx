import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CalendarEvent, EventStatus, TRACKABLE_TYPES, hasEventStartPassed, eventTopOffset, renderedEventHeight, isCheckboxType } from '../utils/eventUtils';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_SLOT_HEIGHT, EventSizes, DEFAULT_EVENT_SIZE } from '../constants/eventSizes';
import { useDrag } from './DragContext';
import { StatusCheckbox } from './StatusCheckbox';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COL_WIDTH = 52;
const TIME_GAP = 4; // styles.time marginLeft

// Approximate width of a string in the system font. Times are a fixed format so this is
// dependable for them; titles vary, and over-estimating one only drops the time, which is
// the precedence we want anyway.
const AVG_CHAR_WIDTH = 0.55;
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * AVG_CHAR_WIDTH;
}

const STATUS_CONFIG: Record<EventStatus, { color: string; icon: string }> = {
  completed: { color: '#1A7A40', icon: 'checkmark-circle' },
  failed:    { color: '#B03030', icon: 'ban' },
  pending:   { color: '#E8980E', icon: 'alert-circle' },
};

interface Props {
  event: CalendarEvent;
  status?: EventStatus;
  onPress: () => void;
  onToggleStatus?: () => void;
  onDragStart?: (event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffsetY: number) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDragCancel?: () => void;
  columnWidth?: number;
  columnOffset?: number;
  gridStartHour?: number;
  slotHeight?: number;
  fontSize?: number;
}

export function EventBlock({
  event, status, onPress, onToggleStatus, onDragStart, onDragMove, onDragEnd, onDragCancel,
  columnWidth = 1, columnOffset = 0, gridStartHour = 6,
  slotHeight = DEFAULT_SLOT_HEIGHT, fontSize = EventSizes[DEFAULT_EVENT_SIZE].fontSize,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { active, event: draggingEvent } = useDrag();
  const top = eventTopOffset(event.startTime, gridStartHour, slotHeight) + 1;
  const height = renderedEventHeight(event, slotHeight);
  const isBeingDragged = active && draggingEvent?.id === event.id;

  const isBackup = !!event.backup;
  // Checkbox types (task, prayer) carry a binary checked/unchecked status instead of the
  // three-state badge, and only when they aren't a backup.
  const isCheckbox = !isBackup && isCheckboxType(event.type);
  const isChecked = status === 'completed';
  const effectiveStatus: EventStatus | undefined = isBackup || isCheckbox ? undefined : (
    status ?? (TRACKABLE_TYPES.has(event.type) && hasEventStartPassed(event) ? 'pending' : undefined)
  );
  const showBadge = isCheckbox || !!effectiveStatus;

  const isDraggingRef = useRef(false);

  const dragPanGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .runOnJS(true)
    .onStart((e) => {
      isDraggingRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const dragPixelWidth = columnWidth * (SCREEN_WIDTH - TIME_COL_WIDTH);
      // e.y is the press position within this block, which the drag math needs
      // to keep the event anchored under the finger.
      onDragStart?.(event, e.absoluteX, e.absoluteY, dragPixelWidth, height, e.y);
    })
    .onUpdate((e) => { if (isBeingDragged) onDragMove?.(e.absoluteX, e.absoluteY); })
    .onEnd((e) => { if (isBeingDragged) onDragEnd?.(e.absoluteX, e.absoluteY); })
    .onFinalize((_e, success) => {
      if (!success && isDraggingRef.current) onDragCancel?.();
      isDraggingRef.current = false;
    });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => { if (success) onPress(); });

  const composed = Gesture.Race(dragPanGesture, tapGesture);

  const stripeCount = Math.ceil(height / 7) + 4;

  // Status badge scales with density so it never outgrows a 15-minute block. Checkbox
  // events render at a fixed small size, so their badge follows that density, not the grid's.
  const badgeSlot = isCheckbox ? EventSizes.sm.slotHeight : slotHeight;
  const badge = Math.round(Math.min(40, Math.max(22, 36 * (badgeSlot / DEFAULT_SLOT_HEIGHT))));
  const badgeInner = Math.round(badge * (2 / 3));
  const badgeInset = Math.round(badge / 6);

  // The title claims the width it needs; the time only appears in what's left over, and
  // only whole — a half-shown start time is worse than none. Widths are derived from
  // columnWidth (the same figure the drag ghost uses) rather than measured, so there is
  // no second layout pass and no flicker.
  const contentWidth =
    columnWidth * (SCREEN_WIDTH - TIME_COL_WIDTH)
    - (isBackup ? 0 : 3)                      // left colour border
    - (isBackup ? 8 : 9)                      // paddingLeft
    - (showBadge ? badge + 6 : 6);            // paddingRight
  const spare = contentWidth - textWidth(event.title, fontSize) - TIME_GAP;

  // Checkbox events have only a start time; everything else can show a start–end range.
  const bothLabel = `${event.startTime} – ${event.endTime}`;
  const timeLabel =
    !isCheckbox && spare >= textWidth(bothLabel, fontSize) ? bothLabel
    : spare >= textWidth(event.startTime, fontSize) ? event.startTime
    : null;

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
            paddingRight: showBadge ? badge + 6 : 6,
            paddingVertical: slotHeight <= 40 || isCheckbox ? 1 : 3,
          },
        ]}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.blockTint, { backgroundColor: event.color + '55' }]} />
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
          <Text style={[styles.title, { fontSize }]} numberOfLines={1}>{event.title}</Text>
          {timeLabel && (
            <Text style={[styles.time, { fontSize }]} numberOfLines={1}>{timeLabel}</Text>
          )}
        </View>

        {isCheckbox && (
          <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(() => onToggleStatus?.())}>
            <View style={[styles.statusWrap, { width: badge }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <StatusCheckbox checked={isChecked} size={badge - 2} color={event.color} />
            </View>
          </GestureDetector>
        )}

        {effectiveStatus && (
          <View style={[styles.statusWrap, { width: badge }]}>
            {effectiveStatus === 'failed' ? (
              <View style={{ width: badgeInner + badgeInset, height: badgeInner + badgeInset, borderRadius: (badgeInner + badgeInset) / 2, backgroundColor: STATUS_CONFIG.failed.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ban-outline" size={badge - 10} color={Colors.white} style={{ transform: [{ scaleX: -1 }] }} />
              </View>
            ) : (
              <View style={{ width: badge, height: badge }}>
                <View style={{ position: 'absolute', width: badgeInner, height: badgeInner, borderRadius: badgeInner / 2, backgroundColor: Colors.card, top: badgeInset, left: badgeInset }} />
                <Ionicons
                  name={effectiveStatus === 'completed' ? 'checkmark-circle' : 'alert-circle'}
                  size={badge}
                  color={effectiveStatus === 'completed' ? STATUS_CONFIG.completed.color : STATUS_CONFIG.pending.color}
                />
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
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    time: {
      color: C.textSecondary,
      marginLeft: 4,
      flexShrink: 0,
    },
    statusWrap: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 6,
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
