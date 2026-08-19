import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CalendarEvent, EventStatus, resolveEventStatus, eventTopOffset, renderedEventHeight, hasEndTime, COMPACT_EVENT_HEIGHT, CALENDAR_CHECKBOX_SIZE } from '../utils/eventUtils';
import { CONTACT_METHODS, resolveContactMethod, usesContactMethod } from '../constants/contactMethods';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_SLOT_HEIGHT, EventSizes, DEFAULT_EVENT_SIZE } from '../constants/eventSizes';
import { useDrag } from './DragContext';
import { StatusCheckbox } from './StatusCheckbox';
import { BASE_SIZE as STATUS_PICKER_BASE_SIZE } from './StatusPicker';
import { GoalIcon } from './GoalIcon';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_COL_WIDTH = 52;
const TIME_GAP = 4; // styles.time marginLeft
const GUTTER_GAP = 3; // between any two of the right-hand gutter's markers
const UNITS_GAP = 3; // between the quantity and its units, inside the one marker
const METHOD_GAP = 5; // between the method marker and the title

// The title's line height and the method glyph, both as multiples of the block's
// font size. The title row is as tall as whichever is larger, and the block's
// padding is derived from that — so either can be retuned without the vertical
// geometry drifting.
const TITLE_LINE_RATIO = 1.3;
const METHOD_ICON_RATIO = 1.45;
/**
 * The gutter quantity, as a multiple of the block's font size — larger than the
 * title, since on a quantity event the number is what's being read. Stays under
 * the repeat marker's 1.75 so it doesn't outweigh the icons beside it, and small
 * enough that its line box still fits COMPACT_EVENT_HEIGHT at every density.
 */
const QUANTITY_FONT_RATIO = 1.3;

/**
 * The status marker's size, at every density and for both forms it takes — the
 * three-state badge and the checkbox.
 *
 * Deliberately not derived from slotHeight. It reports state, and state does not
 * become more or less important because the calendar is set denser; a marker
 * that changed size between settings made the same event look like a different
 * kind of thing. Pinned to COMPACT_EVENT_HEIGHT — the shortest a block ever
 * renders, at any density — so the marker never draws taller than the smallest
 * event it might sit on.
 */
const STATUS_MARKER_SIZE = COMPACT_EVENT_HEIGHT;

// The block's visual signature. Named because each of these appears twice: once in
// the rendered style, and once in the width arithmetic that decides whether the
// time label still fits.
const BLOCK = {
  borderRadius: 2,
  /** The left bar carrying the event's type colour. */
  accentWidth: 3,
  /** Alpha suffix appended to the event colour for the block's fill. */
  tintAlpha: '55',
  paddingLeft: 9,
  paddingRight: 6,
} as const;

// Approximate width of a string in the system font. Times are a fixed format so this is
// dependable for them; titles vary, and over-estimating one only drops the time, which is
// the precedence we want anyway.
const AVG_CHAR_WIDTH = 0.55;
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * AVG_CHAR_WIDTH;
}

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
  /**
   * Render in a list rather than positioned into the time grid: no absolute
   * placement and no drag, since neither means anything outside the calendar.
   * Everything else — tint, accent, badge, checkbox, density — is unchanged, which
   * is the point of reusing this instead of imitating it.
   */
  inline?: boolean;
  /**
   * `undefined` outside multi-select (normal tap-to-edit behaviour). `true`/`false`
   * once a selection is active — mirrors PersonCard, where the same three-state
   * prop both signals "selection mode is on" and carries this row's state.
   */
  selected?: boolean;
}

export function EventBlock({
  event, status, onPress, onToggleStatus, onDragStart, onDragMove, onDragEnd, onDragCancel,
  columnWidth = 1, columnOffset = 0, gridStartHour = 6,
  slotHeight = DEFAULT_SLOT_HEIGHT, fontSize = EventSizes[DEFAULT_EVENT_SIZE].fontSize,
  inline = false, selected,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { byId: eventTypeById } = useEventTypeDefinitions();

  const statusColor: Record<EventStatus, string> = {
    completed: Colors.statusCompleted,
    failed: Colors.statusFailed,
    pending: Colors.statusPending,
  };

  const { active, event: draggingEvent, groupIds } = useDrag();
  const top = eventTopOffset(event.startTime, gridStartHour, slotHeight) + 1;
  const height = renderedEventHeight(event, slotHeight);
  // A group drag carries the whole multi-selection, not just the block that was
  // grabbed — every member has to lift off the grid, or the ones left behind
  // would show both their original block and their floating ghost at once.
  const isBeingDragged = active && (draggingEvent?.id === event.id || (groupIds?.has(event.id) ?? false));

  const isBackup = !!event.backup;
  // A type set to Checkbox in Event Types carries a binary checked/unchecked
  // status instead of the three-state badge, and only when it isn't a backup.
  const isCheckbox = !isBackup && eventTypeById[event.type]?.reportStyle === 'checkbox';
  const isChecked = status === 'completed';
  // The state comes from resolveEventStatus; only the choice not to draw it as a
  // badge belongs here. Synthesising pending locally is what let this drift from
  // the unreported sweep's idea of the same word.
  const effectiveStatus: EventStatus | undefined =
    isBackup || isCheckbox ? undefined : resolveEventStatus(event, status, eventTypeById);
  // Multi-select takes over the right-hand gutter entirely: repeat marker and
  // status badge both stand down so the selection checkbox is the only thing
  // there, rather than competing with whatever the event would normally show.
  const inSelectMode = selected !== undefined;
  const showBadge = inSelectMode || isCheckbox || !!effectiveStatus;

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

  // No onDragStart means this block isn't draggable right now — an unselected
  // row during multi-select, or a read-only prev/next pane. Racing the pan
  // gesture anyway would still let a long-press "activate" it and swallow the
  // tap for nothing, so drop it from the race entirely rather than let it win.
  const composed = inline || !onDragStart ? tapGesture : Gesture.Race(dragPanGesture, tapGesture);

  const stripeCount = Math.ceil(height / 7) + 4;

  const badge = STATUS_MARKER_SIZE;
  const badgeInner = Math.round(badge * (2 / 3));
  const badgeInset = Math.round(badge / 6);
  // Matches the ban disc/glyph ratio StatusPicker uses at its own BASE_SIZE, so the
  // failed marker's circle-to-icon proportion is identical on the block and in the menu.
  // Rounded to whole pixels, and the glyph is set in from the rounded disc by an
  // integer inset on each side — leaving either value fractional lets the layout
  // engine snap width and centring separately, which reads as off-centre at this size.
  const failedScale = badge / STATUS_PICKER_BASE_SIZE;
  const failedDisc = Math.round(45 * failedScale);
  const failedInset = Math.round((failedDisc - 39 * failedScale) / 2);
  const failedGlyph = failedDisc - failedInset * 2;

  // The title claims the width it needs; the time only appears in what's left over, and
  // only whole — a half-shown start time is worse than none. Widths are derived from
  // columnWidth (the same figure the drag ghost uses) rather than measured, so there is
  // no second layout pass and no flicker.
  // Scales with the block's font so it stays proportionate at every density.
  const repeatSize = Math.round(fontSize * 1.75);
  const isRecurring = !!event.recurring;
  const showRepeatIcon = isRecurring && !inSelectMode;

  // A quantity-mode type's event carries its own number — the same figure the
  // detail sheet's stepper edits, and what getGoalContribution() adds to the
  // goal. Shown only once there's something to show: a 0 is the state every such
  // event starts in, and the status marker already says it's unreported.
  const quantityLabel =
    !isBackup && !inSelectMode
    && eventTypeById[event.type]?.goalMode === 'quantity'
    && (event.quantity ?? 0) > 0
      ? String(event.quantity)
      : null;
  const quantityFontSize = Math.round(fontSize * QUANTITY_FONT_RATIO);
  // What the number counts, if the event says. Rides alongside at the title's own
  // size rather than the number's, so "5 miles" reads as one value with the digit
  // leading it instead of two things of equal weight. Only ever shown with a
  // number — a unit by itself counts nothing.
  const unitsLabel = quantityLabel ? (event.units?.trim() || null) : null;
  // Deliberately generous — each Text sizes to its own content, so this figure
  // only reserves room. Under-reserving would let the repeat marker slide
  // underneath the digits; over-reserving costs the title a few points.
  const quantityWidth = quantityLabel
    ? Math.ceil(quantityLabel.length * quantityFontSize * 0.62)
      + (unitsLabel ? UNITS_GAP + Math.ceil(unitsLabel.length * fontSize * 0.62) : 0)
    : 0;

  // The right-hand gutter, filled from the edge inward: status badge, then the
  // quantity, then the repeat marker. Each one's `right` is everything already
  // placed outside it, so whichever are absent simply close up. All are
  // absolute, so the gutter has to be reserved as paddingRight or the title
  // would run underneath them.
  const quantityRight = showBadge ? 6 + badge + GUTTER_GAP : 6;
  const repeatRight = quantityRight + (quantityLabel ? quantityWidth + GUTTER_GAP : 0);
  const gutter =
    showRepeatIcon ? repeatRight + repeatSize
    : quantityLabel ? quantityRight + quantityWidth
    : showBadge ? 6 + badge
    : BLOCK.paddingRight;

  // Contacts and dates lead with how they happened — a phone glyph on a phone
  // call, a screen on a video date. It rides the title row, so it sits on the
  // baseline the title does rather than floating in a gutter of its own.
  const method = usesContactMethod(event.type)
    ? CONTACT_METHODS[resolveContactMethod(event.contactMethod, event.type)]
    : null;
  const methodSize = Math.round(fontSize * METHOD_ICON_RATIO);
  const methodWidth = method ? methodSize + METHOD_GAP : 0;

  // The title's line height is pinned rather than left to the platform's default
  // line spacing, because the padding below is derived from the row's height and
  // that can't be a guess. The glyph is the taller of the two, so it sets the
  // row's height on the blocks that carry one.
  const titleLineHeight = Math.round(fontSize * TITLE_LINE_RATIO);
  const rowHeight = Math.max(titleLineHeight, method ? methodSize : 0);

  /**
   * Every block gets the padding that would centre its title inside a
   * no-duration block.
   *
   * So a contact logged without an end time reads as centred without anything
   * actually centring it, and a longer event gets the same figure as breathing
   * room at the top — the titles across a column still line up, just lower than
   * they used to. Capped by what this block can afford, since a 15-minute block
   * at the smallest density is shorter than the compact height and would
   * otherwise push its own title out of view.
   */
  const blockPadding = Math.max(1, Math.min(
    Math.floor((COMPACT_EVENT_HEIGHT - rowHeight) / 2),
    Math.floor((height - rowHeight) / 2),
  ));

  const contentWidth =
    columnWidth * (SCREEN_WIDTH - TIME_COL_WIDTH)
    - (isBackup ? 0 : BLOCK.accentWidth)              // left colour border
    - (isBackup ? 8 : BLOCK.paddingLeft)              // paddingLeft
    - gutter                                          // paddingRight
    - methodWidth;                                    // leading method marker

  const spare = contentWidth - textWidth(event.title, fontSize) - TIME_GAP;

  // Only an event that actually spans time can show a start–end range; a checkbox
  // event, or a contact logged without an end, has just the one time to show.
  const bothLabel = `${event.startTime} – ${event.endTime}`;
  const timeLabel =
    hasEndTime(event) && spare >= textWidth(bothLabel, fontSize) ? bothLabel
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
            borderLeftWidth: isBackup ? 0 : BLOCK.accentWidth,
            borderLeftColor: isBackup ? 'transparent' : event.color,
            left: `${columnOffset * 100}%` as any,
            width: `${columnWidth * 100}%` as any,
            opacity: isBeingDragged ? 0 : 1,
            paddingLeft: isBackup ? 8 : BLOCK.paddingLeft,
            paddingRight: gutter,
            paddingVertical: blockPadding,
          },
          // Last, so it wins over the grid placement computed above.
          inline && styles.blockInline,
        ]}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.blockTint, { backgroundColor: event.color + BLOCK.tintAlpha }]} />
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
          {method && (
            <View style={{ marginRight: METHOD_GAP }}>
              <GoalIcon
                icon={method.icon}
                iconFamily={method.iconFamily}
                size={methodSize}
                color={Colors.text}
              />
            </View>
          )}
          <Text style={[styles.title, { fontSize, lineHeight: titleLineHeight }]} numberOfLines={1}>
            {event.title}
          </Text>
          {timeLabel && (
            <Text style={[styles.time, { fontSize, lineHeight: titleLineHeight }]} numberOfLines={1}>
              {timeLabel}
            </Text>
          )}
        </View>

        {showRepeatIcon && (
          <View style={[styles.statusWrap, { width: repeatSize, right: repeatRight }]}>
            <Ionicons name="sync-outline" size={repeatSize} color={Colors.textSecondary} />
          </View>
        )}

        {quantityLabel && (
          <View style={[styles.statusWrap, { right: quantityRight }]}>
            {/* Nested so the pair can sit on a shared baseline while the wrap
                still centres it in the block's height — one row can't do both,
                since baseline alignment is what would otherwise position it
                vertically. */}
            <View style={styles.quantityRow}>
              <Text
                style={[styles.quantity, {
                  fontSize: quantityFontSize,
                  lineHeight: Math.round(quantityFontSize * TITLE_LINE_RATIO),
                }]}
                numberOfLines={1}
              >
                {quantityLabel}
              </Text>
              {unitsLabel && (
                <Text
                  style={[styles.units, { fontSize, lineHeight: titleLineHeight, marginLeft: UNITS_GAP }]}
                  numberOfLines={1}
                >
                  {unitsLabel}
                </Text>
              )}
            </View>
          </View>
        )}

        {!inSelectMode && isCheckbox && (
          <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(() => onToggleStatus?.())}>
            <View style={[styles.statusWrap, { width: badge }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <StatusCheckbox checked={isChecked} size={CALENDAR_CHECKBOX_SIZE} color={event.color} />
            </View>
          </GestureDetector>
        )}

        {!inSelectMode && effectiveStatus && (
          <View style={[styles.statusWrap, { width: badge }]}>
            {effectiveStatus === 'failed' ? (
              <View style={{ width: failedDisc, height: failedDisc, borderRadius: failedDisc / 2, backgroundColor: statusColor.failed, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ban-outline" size={failedGlyph} color={Colors.white} style={{ transform: [{ scaleX: -1 }] }} />
              </View>
            ) : (
              <View style={{ width: badge, height: badge }}>
                <View style={{ position: 'absolute', width: badgeInner, height: badgeInner, borderRadius: badgeInner / 2, backgroundColor: Colors.card, top: badgeInset, left: badgeInset }} />
                <Ionicons
                  name={effectiveStatus === 'completed' ? 'checkmark-circle' : 'alert-circle'}
                  size={badge}
                  color={effectiveStatus === 'completed' ? statusColor.completed : statusColor.pending}
                />
              </View>
            )}
          </View>
        )}

        {inSelectMode && (
          // The checkbox itself is what marks selection — a bigger tap target
          // than the glyph alone, but no border/tint on the block: selected
          // state lives here, not in the block's own decoration.
          <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(() => onPress())}>
            <View style={[styles.statusWrap, { width: badge }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <StatusCheckbox checked={!!selected} size={CALENDAR_CHECKBOX_SIZE} color={Colors.control} />
            </View>
          </GestureDetector>
        )}
      </View>
    </GestureDetector>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    block: {
      position: 'absolute',
      borderLeftWidth: BLOCK.accentWidth,
      borderRadius: BLOCK.borderRadius,
      paddingLeft: 6,
      paddingRight: BLOCK.paddingRight,
      paddingVertical: 3,
      overflow: 'hidden',
      backgroundColor: C.card,
    },
    blockInline: {
      position: 'relative',
      top: 0,
      left: 0,
      width: '100%',
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
      marginLeft: TIME_GAP,
      flexShrink: 0,
    },
    quantityRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    // A value rather than a label, so it carries the title's weight and colour
    // instead of the time's — it's the point of the event, not an annotation.
    quantity: {
      fontWeight: '700',
      color: C.text,
    },
    // The unit is the annotation, so here the time's treatment is right: it
    // names what the number is without competing with it.
    units: {
      fontWeight: '600',
      color: C.textSecondary,
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
