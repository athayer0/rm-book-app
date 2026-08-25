import React, { useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CalendarEvent, EventStatus, resolveEventStatus, eventTopOffset, renderedEventHeight, hasEndTime, COMPACT_EVENT_HEIGHT, CALENDAR_CHECKBOX_SIZE } from '../utils/eventUtils';
import { CONTACT_METHODS, resolveContactMethod, usesContactMethod } from '../constants/contactMethods';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { displayTime, parseTimeString, addMinutesToTimeString } from '../utils/dateUtils';
import { contrastInk } from '../utils/colorUtils';
import { DEFAULT_SLOT_HEIGHT, EventSizes, DEFAULT_EVENT_SIZE, TIME_COL_WIDTH } from '../constants/eventSizes';
import { useDrag } from './DragContext';
import { StatusCheckbox } from './StatusCheckbox';
import { BASE_SIZE as STATUS_PICKER_BASE_SIZE } from './StatusPicker';
import { GoalIcon } from './GoalIcon';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIME_GAP = 4; // styles.time marginLeft
const GUTTER_GAP = 3; // between any two of the right-hand gutter's markers
const UNITS_GAP = 3; // between the quantity and its units, inside the one marker
const METHOD_GAP = 5; // between the method marker and the title

// Edge resize: each touch strip is carved out of the block's own top/bottom
// via a negative hitSlop rather than a separate child view, so grabbing it
// needs no extra layout pass. Kept comfortably under COMPACT_EVENT_HEIGHT
// (the shortest a resizable block ever renders) so it never eats the whole block.
const RESIZE_HANDLE_HEIGHT = 7;
// How long an edge has to be held before it engages — same figure the
// move-drag below uses, so every long-press gesture on a block feels the same.
const RESIZE_LONG_PRESS_MS = 400;
// The granularity the user asked for — every drag snaps the end time to a
// multiple of this many minutes.
const RESIZE_INCREMENT_MIN = 5;
// A block can shrink to one increment, never to (or past) zero duration —
// zero is how "no end time" is stored, and that means a different kind of
// block (see hasEndTime).
const MIN_EVENT_DURATION_MIN = RESIZE_INCREMENT_MIN;

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
// Bold (and semibold) glyphs render measurably wider per character than the
// regular weight AVG_CHAR_WIDTH was calibrated against. The title renders
// bold, so measuring it with the regular constant systematically
// underestimates its real width — which is exactly what let the "is there
// spare room for the time" check say yes when there wasn't quite enough,
// letting the title's flexShrink quietly eat its own last character to make
// room. Anything measured at this weight (title, quantity, units) must use
// this constant instead so that check only ever errs toward hiding the time,
// never toward showing one that clips the title.
const AVG_CHAR_WIDTH_BOLD = 0.62;
function textWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? AVG_CHAR_WIDTH_BOLD : AVG_CHAR_WIDTH);
}

// Wraps `text` into as many lines as it takes to show it in full, none wider
// than `lineWidth` under the same width heuristic textWidth() uses everywhere
// else in this file — always measured bold, since this only ever chops the
// (bold) title. Wraps on word boundaries where possible; a single word
// wider than lineWidth on its own (e.g. "Refrigerator" in a narrow column) is
// split character-by-character instead of overrunning the line.
//
// Deliberately uncapped: an earlier version stopped once it had produced as
// many lines as the block's height seemed to have room for, which meant any
// title needing a second line in a no-duration block (COMPACT_EVENT_HEIGHT is
// short enough to fit only one line's worth) silently dropped every word
// after the first. Producing every line and letting the caller render them
// inside the block's own `overflow: hidden` + fixed height means the block's
// actual edge does the cutting — including, if it comes to it, showing a
// partial last line — rather than this function guessing wrong and dropping
// whole words instead.
function wrapTitleLines(text: string, fontSize: number, lineWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  let word = '';

  function flushWord() {
    while (word) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, fontSize, true) <= lineWidth) {
        line = candidate;
        word = '';
        return;
      }
      if (line) {
        // Doesn't fit alongside what's already on the line — close the line
        // out and retry the whole word against a fresh one.
        lines.push(line);
        line = '';
        continue;
      }
      // Doesn't fit even alone on an empty line — split it character by
      // character, taking as much as fits (at least one character, so a
      // pathological single glyph wider than lineWidth still terminates).
      let chunk = '';
      for (const ch of word) {
        if (chunk && textWidth(chunk + ch, fontSize, true) > lineWidth) break;
        chunk += ch;
      }
      lines.push(chunk);
      word = word.slice(chunk.length);
    }
  }

  for (const ch of text) {
    if (ch === ' ') flushWord();
    else word += ch;
  }
  flushWord();
  if (line) lines.push(line);
  return lines;
}

function timeStringToMinutes(t: string): number {
  const { hour, minute } = parseTimeString(t);
  return hour * 60 + minute;
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
  /**
   * Holding the bottom edge enters resize mode until release, dragging up/down
   * to change the event's length in RESIZE_INCREMENT_MIN steps. Fires once, on
   * release, with the final snapped end time — everything in between is this
   * block's own local state, so the caller only ever sees the committed value.
   */
  onResizeEnd?: (event: CalendarEvent, newEndTime: string) => void;
  /** Same as onResizeEnd, mirrored onto the top edge: changes startTime instead. */
  onResizeStart?: (event: CalendarEvent, newStartTime: string) => void;
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
  event, status, onPress, onToggleStatus, onDragStart, onDragMove, onDragEnd, onDragCancel, onResizeEnd, onResizeStart,
  columnWidth = 1, columnOffset = 0, gridStartHour = 6,
  slotHeight = DEFAULT_SLOT_HEIGHT, fontSize = EventSizes[DEFAULT_EVENT_SIZE].fontSize,
  inline = false, selected,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
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

  // Resizing an edge — top changes startTime, bottom changes endTime, the
  // other edge held fixed either way. A checkbox/no-end block has no edge
  // worth grabbing (hasEndTime), and neither list rendering, a backup block,
  // nor multi-select owns either gesture.
  const resizeEnabled = !inline && !isBackup && !inSelectMode && hasEndTime(event) && !!onResizeEnd;
  const startResizeEnabled = !inline && !isBackup && !inSelectMode && hasEndTime(event) && !!onResizeStart;

  // null outside a resize; once set, the number of minutes (snapped, signed)
  // the current drag has moved that edge by, relative to the event's own
  // stored time — never relative to the previous frame, so drift can't
  // accumulate across onUpdate calls.
  const [endDeltaMin, setEndDeltaMin] = useState<number | null>(null);
  const [startDeltaMin, setStartDeltaMin] = useState<number | null>(null);
  const isResizingEnd = endDeltaMin !== null;
  const isResizingStart = startDeltaMin !== null;
  const isResizingAny = isResizingEnd || isResizingStart;
  // The tint goes solid event.color while resizing (below), so the ink riding
  // on top has to be picked for that background rather than assumed dark —
  // same rule useColors already applies to a chosen primary colour.
  const resizeInk = isResizingAny ? contrastInk(event.color) : null;

  const origStartMin = timeStringToMinutes(event.startTime);
  let origEndMin = timeStringToMinutes(event.endTime);
  if (origEndMin <= origStartMin) origEndMin += 24 * 60; // midnight wrap, same rule as eventHeight()
  const origDurationMin = origEndMin - origStartMin;

  const pxPerMin = slotHeight / 30;
  const liveEndTime = isResizingEnd ? addMinutesToTimeString(event.endTime, endDeltaMin) : event.endTime;
  const liveStartTime = isResizingStart ? addMinutesToTimeString(event.startTime, startDeltaMin) : event.startTime;
  // The block's live position/height while resizing — computed the same way
  // the real eventTopOffset/renderedEventHeight are, off a copy of the event
  // carrying the in-progress time, so the growing/shrinking block matches
  // exactly what will be saved on release.
  const displayTop = isResizingStart ? eventTopOffset(liveStartTime, gridStartHour, slotHeight) + 1 : top;
  const displayHeight = isResizingEnd
    ? renderedEventHeight({ ...event, endTime: liveEndTime }, slotHeight)
    : isResizingStart
    ? renderedEventHeight({ ...event, startTime: liveStartTime }, slotHeight)
    : height;

  // Last delta a haptic already fired for, so onUpdate only buzzes again once
  // the snapped value actually moves to its next 5-minute step, not on every
  // frame that happens to land on the same one.
  const endDeltaHapticRef = useRef(0);
  const startDeltaHapticRef = useRef(0);

  const endResizeGesture = Gesture.Pan()
    .enabled(resizeEnabled)
    // Same hold as the move-drag below, and for the same reason: without it,
    // the first pixel of an ordinary touch on the strip would already read as
    // "resize". (No .minDistance() here — with activateAfterLongPress set, a
    // minDistance of anything less than the platform default would let
    // shouldActivate() fire before the long-press timer ever does.)
    .activateAfterLongPress(RESIZE_LONG_PRESS_MS)
    // Shrinks the gesture's own touch area to just the bottom strip (a
    // negative `top` removes that many px from the top edge inward) rather
    // than a separate child view — see RESIZE_HANDLE_HEIGHT.
    .hitSlop({ top: -Math.max(height - RESIZE_HANDLE_HEIGHT, 0) })
    .runOnJS(true)
    .onStart(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      endDeltaHapticRef.current = 0;
      setEndDeltaMin(0);
    })
    .onUpdate((e) => {
      const rawMin = e.translationY / pxPerMin;
      const snapped = Math.round(rawMin / RESIZE_INCREMENT_MIN) * RESIZE_INCREMENT_MIN;
      const minDelta = -(origDurationMin - MIN_EVENT_DURATION_MIN);
      const maxDelta = (24 * 60 - RESIZE_INCREMENT_MIN) - origDurationMin;
      const clamped = Math.max(minDelta, Math.min(snapped, maxDelta));
      if (clamped !== endDeltaHapticRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        endDeltaHapticRef.current = clamped;
      }
      setEndDeltaMin(clamped);
    })
    .onEnd(() => {
      if (endDeltaMin) onResizeEnd?.(event, addMinutesToTimeString(event.endTime, endDeltaMin));
    })
    .onFinalize(() => {
      setEndDeltaMin(null);
    });

  const startResizeGesture = Gesture.Pan()
    .enabled(startResizeEnabled)
    .activateAfterLongPress(RESIZE_LONG_PRESS_MS)
    // Mirrors endResizeGesture's hitSlop, restricted to the top strip instead.
    .hitSlop({ bottom: -Math.max(height - RESIZE_HANDLE_HEIGHT, 0) })
    .runOnJS(true)
    .onStart(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startDeltaHapticRef.current = 0;
      setStartDeltaMin(0);
    })
    .onUpdate((e) => {
      const rawMin = e.translationY / pxPerMin;
      const snapped = Math.round(rawMin / RESIZE_INCREMENT_MIN) * RESIZE_INCREMENT_MIN;
      // Dragging the top edge down shortens the event from the front, up
      // lengthens it — the mirror image of the bottom edge's clamp, plus a
      // floor at midnight since a start time (unlike an end time) never wraps.
      const maxDelta = origDurationMin - MIN_EVENT_DURATION_MIN;
      const minDelta = Math.max(origDurationMin - (24 * 60 - RESIZE_INCREMENT_MIN), -origStartMin);
      const clamped = Math.max(minDelta, Math.min(snapped, maxDelta));
      if (clamped !== startDeltaHapticRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        startDeltaHapticRef.current = clamped;
      }
      setStartDeltaMin(clamped);
    })
    .onEnd(() => {
      if (startDeltaMin) onResizeStart?.(event, addMinutesToTimeString(event.startTime, startDeltaMin));
    })
    .onFinalize(() => {
      setStartDeltaMin(null);
    });

  const isDraggingRef = useRef(false);

  const dragPanGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    // Give the resize handles exclusive claim to the top/bottom strips —
    // without this, a long, still press there would eventually win the
    // move-drag instead of the resize it's sitting on top of.
    .hitSlop(resizeEnabled || startResizeEnabled
      ? { top: -RESIZE_HANDLE_HEIGHT, bottom: -RESIZE_HANDLE_HEIGHT }
      : {})
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
  // The resize gestures ride along even then: each is independently
  // `.enabled()`, and its own hitSlop keeps it out of the way whenever it isn't.
  const composed = inline || !onDragStart
    ? Gesture.Race(endResizeGesture, startResizeGesture, tapGesture)
    : Gesture.Race(endResizeGesture, startResizeGesture, dragPanGesture, tapGesture);

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
    ? Math.ceil(textWidth(quantityLabel, quantityFontSize, true))
      + (unitsLabel ? UNITS_GAP + Math.ceil(textWidth(unitsLabel, fontSize, true)) : 0)
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
  // that can't be a guess.
  const titleLineHeight = Math.round(fontSize * TITLE_LINE_RATIO);

  const contentWidth =
    columnWidth * (SCREEN_WIDTH - TIME_COL_WIDTH)
    - (isBackup ? 0 : BLOCK.accentWidth)              // left colour border
    - (isBackup ? 8 : BLOCK.paddingLeft)              // paddingLeft
    - gutter                                          // paddingRight
    - methodWidth;                                    // leading method marker

  const titleWidth = textWidth(event.title, fontSize, true);
  const titleFitsOneLine = titleWidth <= contentWidth;

  const spare = contentWidth - titleWidth - TIME_GAP;

  // Only an event that actually spans time can show a start–end range; a checkbox
  // event, or a contact logged without an end, has just the one time to show. A
  // title that doesn't even fit on one line has already claimed the whole row —
  // there's nothing left to spare a time into.
  // Localized before either the width math or the render below — "a.m."/"p.m."
  // isn't the same length as "AM"/"PM", so the fit check has to measure
  // whatever's actually going to be drawn, not the stored English form.
  const displayStart = displayTime(event.startTime, settings.language, settings.timeFormat);
  const displayEnd = displayTime(event.endTime, settings.language, settings.timeFormat);
  const bothLabel = `${displayStart} – ${displayEnd}`;
  const timeLabel = !titleFitsOneLine ? null
    : hasEndTime(event) && spare >= textWidth(bothLabel, fontSize) ? bothLabel
    : spare >= textWidth(displayStart, fontSize) ? displayStart
    : null;

  // A title that doesn't fit on one line wraps word-by-word (splitting an
  // overlong single word by character) into however many lines it needs.
  // Nothing here caps that count — the block's own overflow: hidden and fixed
  // height, below, are what actually cut it off.
  const titleLines = titleFitsOneLine
    ? [event.title]
    : wrapTitleLines(event.title, fontSize, contentWidth);

  // The glyph is the taller of the two on a single-line title, so it sets the
  // row's height on the blocks that carry one; a wrapped title instead grows
  // the row itself.
  const rowHeight = Math.max(titleLineHeight * titleLines.length, method ? methodSize : 0);

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

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[
          styles.wrapper,
          {
            top: displayTop,
            height: displayHeight,
            left: `${columnOffset * 100}%` as any,
            width: `${columnWidth * 100}%` as any,
            opacity: isBeingDragged ? 0 : 1,
            // Lifted above its siblings while resizing, so a block growing
            // over whatever sits below it draws on top rather than under.
            zIndex: isResizingAny ? 20 : 0,
          },
          // Last, so it wins over the grid placement computed above.
          inline && styles.wrapperInline,
        ]}
      >
      <View
        style={[
          styles.block,
          {
            // The accent used to be a borderLeftWidth/borderLeftColor pair, but a
            // border only on one side fights borderRadius on the corners it
            // doesn't touch — the right corners rendered square. Drawn as its own
            // view instead (below), clipped by the block's own overflow: hidden,
            // so paddingLeft now reserves room for that view rather than a border box.
            paddingLeft: isBackup ? 8 : BLOCK.accentWidth + BLOCK.paddingLeft,
            paddingRight: gutter,
            paddingVertical: blockPadding,
          },
        ]}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.blockTint, { backgroundColor: isResizingAny ? event.color : event.color + BLOCK.tintAlpha }]} />
        {!isBackup && (
          <View style={[styles.accentBar, { width: BLOCK.accentWidth, backgroundColor: event.color }]} />
        )}
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
                color={resizeInk ?? Colors.text}
              />
            </View>
          )}
          {titleFitsOneLine ? (
            // titleFitsOneLine already confirmed this fits via textWidth()'s
            // estimate, so numberOfLines={1} normally never binds — but that
            // estimate is a flat per-character average, not real font metrics,
            // so it can be a hair off for an unusual string. 'clip' is the
            // backstop for that gap: silently clip rather than fall back to
            // RN's default 'tail' ellipsis, which this app never shows.
            <Text
              style={[styles.title, { fontSize, lineHeight: titleLineHeight }, resizeInk && { color: resizeInk }]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {event.title}
            </Text>
          ) : (
            // One Text per computed line, each hard-capped to numberOfLines={1},
            // rather than one Text holding every line joined by "\n". RN's own
            // wrapping still runs on whatever a Text is given, using the real
            // font metrics rather than wrapTitleLines' textWidth() estimate — a
            // single multi-line Text let it silently re-flow across the line
            // boundaries we'd already chosen (that's what turned "Morning" into
            // "Morni" / "n" / "g"). As separate elements, RN can clip an
            // individual line if our estimate ran a hair wide, but it can't
            // merge or re-split across lines we've already decided on. The
            // block's overflow: hidden + fixed height still does the vertical
            // cutting — this only stops horizontal re-wrapping within a line.
            <View style={{ flexShrink: 1 }}>
              {titleLines.map((line, i) => (
                <Text
                  key={i}
                  style={[styles.title, { fontSize, lineHeight: titleLineHeight }, resizeInk && { color: resizeInk }]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                >
                  {line}
                </Text>
              ))}
            </View>
          )}
          {timeLabel && (
            // Same backstop as the title above: the spare/textWidth() checks that
            // chose timeLabel are an estimate, so 'clip' guards against that
            // estimate being a hair optimistic rather than ever showing "…".
            <Text
              style={[styles.time, { fontSize, lineHeight: titleLineHeight }, resizeInk && { color: resizeInk }]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {timeLabel}
            </Text>
          )}
        </View>

        {showRepeatIcon && (
          <View style={[styles.statusWrap, { width: repeatSize, right: repeatRight }]}>
            <Ionicons name="sync-outline" size={repeatSize} color={resizeInk ?? Colors.textSecondary} />
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
                }, resizeInk && { color: resizeInk }]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {quantityLabel}
              </Text>
              {unitsLabel && (
                <Text
                  style={[styles.units, { fontSize, lineHeight: titleLineHeight, marginLeft: UNITS_GAP }, resizeInk && { color: resizeInk }]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
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

        {isResizingStart && (
          <View pointerEvents="none" style={styles.resizeLabelWrapTop}>
            <Text style={styles.resizeLabelText} numberOfLines={1}>
              {displayTime(liveStartTime, settings.language, settings.timeFormat)}
            </Text>
          </View>
        )}

        {isResizingEnd && (
          <View pointerEvents="none" style={styles.resizeLabelWrapBottom}>
            <Text style={styles.resizeLabelText} numberOfLines={1}>
              {displayTime(liveEndTime, settings.language, settings.timeFormat)}
            </Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    // Positions and sizes the event in the grid (or, inline, just takes full
    // width in flow). Deliberately not clipped: styles.block below is the
    // thing with overflow: hidden, so the resize handle and its label — its
    // siblings here, not its children — can sit right on top of and below the
    // block's own bottom edge without being cut off by it.
    wrapper: {
      position: 'absolute',
    },
    wrapperInline: {
      position: 'relative',
      top: 0,
      left: 0,
      width: '100%',
    },
    block: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: BLOCK.borderRadius,
      paddingLeft: 6,
      paddingRight: BLOCK.paddingRight,
      paddingVertical: 3,
      overflow: 'hidden',
      backgroundColor: C.card,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
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
    // Hangs off the edge rather than sitting inside it, so it reads as
    // labelling the edge itself rather than as one more line of block content.
    resizeLabelWrapBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -21,
      alignItems: 'center',
    },
    resizeLabelWrapTop: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: -21,
      alignItems: 'center',
    },
    resizeLabelText: {
      fontSize: 11,
      fontWeight: '700',
      color: C.white,
      backgroundColor: C.control,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
  });
}
