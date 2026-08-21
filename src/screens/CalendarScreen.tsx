import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import { type ColorPalette } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';
import { dateFnsLocale, datePattern, yearLabel } from '../utils/dateFnsLocale';
import { weekdayShortLabels } from '../utils/dateUtils';
import { TimeGrid } from '../components/TimeGrid';
import { DayPager } from '../components/DayPager';
import { WeekStrip } from '../components/WeekStrip';
import { FAB, type FABAction } from '../components/FAB';
import { AddEditEventModal } from '../modals/AddEditEventModal';
import { EventTypeSheet } from '../modals/EventTypeSheet';
import { CalendarEvent, renderedEventHeight, hasEndTime, eventTopOffset } from '../utils/eventUtils';
import { EventSizes, resolveEventSize } from '../constants/eventSizes';
import { DragProvider, useDrag } from '../components/DragContext';
import { useEventReport } from '../hooks/useEventReport';
import { addMinutesToTimeString, formatTime, nextHalfHour, parseTimeString } from '../utils/dateUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const EDGE_ZONE = 60;

function CalendarContent({ route, navigation }: { route?: any; navigation?: any }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>();
  // Only ever set by a quick-add bubble, and replaced wholesale each time: the
  // modal resets off this prop's identity, so it has to be a fresh object per
  // pick and the same one for as long as that pick's form is open.
  const [prefill, setPrefill] = useState<Partial<CalendarEvent> | null>(null);
  // Set only by tapping an empty slot, and read once the type sheet resolves —
  // the slot's time has to survive the intermediary popup, since nothing else
  // carries it forward.
  const [pendingTapTime, setPendingTapTime] = useState<string | null>(null);
  const { getForDate, addEvent, updateEvent, updateOccurrence, updateFromDate, deleteOccurrence, deleteFromDate } = useCalendarEvents();
  const { settings } = useSettings();
  const { byId: eventTypeById } = useEventTypeDefinitions();
  const { getStatus, report } = useEventReport();
  const { active: dragActive, event: dragEvent, ghostX, ghostY, ghostWidth, ghostHeight, grabOffsetY, endDrag, startDrag, moveDrag } = useDrag();
  const frozenEventsRef = useRef<CalendarEvent[] | null>(null);
  const frozenDateRef = useRef<string | null>(null);
  // Multi-select: entered from the header's checkbox icon, which fills in
  // while active; a trash icon appears beside it once something's selected.
  // Confined to the day on screen — navigating to another day drops it (see
  // the effect below), so there's never a selection spanning two days.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  // Snapshot of every selected event's own date/time/pixel-position, taken when a
  // drag starts on one of them. The anchor (the block actually grabbed) resolves
  // the drop as usual; every other selected event then replays the same
  // day/minute delta off this snapshot, which is why it has to be captured up
  // front rather than reread off `events` at drop time — by then, the day on
  // screen may have changed. The same snapshot also drives the extra ghost
  // blocks during the drag, so the whole group visibly moves together.
  const groupDragOriginalRef = useRef<Map<string, {
    date: string; startTime: string; endTime: string; hasEnd: boolean; recurring: boolean;
    title: string; color: string; topOffset: number; height: number;
  }> | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [headerBottom, setHeaderBottom] = useState(60);
  // Shared vertical scroll offset so every day page stays aligned to the same time-of-day.
  const [syncScrollY, setSyncScrollY] = useState(0);

  const { slotHeight: SLOT_HEIGHT, fontSize: eventFontSize } = EventSizes[resolveEventSize(settings.eventSize)];
  const DRAG_SLOT_HEIGHT = SLOT_HEIGHT / 2;

  // The bubbles take their colour from the button, not from the type, so only
  // label/icon vary. settings.quickAddTypes is the user's own picked-and-ordered
  // list (Settings > Quick Add) — a type dropped from it there, or deleted
  // since, just falls out of the filter rather than needing cleanup here.
  const quickActions = useMemo<FABAction[]>(
    () =>
      settings.quickAddTypes
        .filter(q => !!eventTypeById[q.id])
        .map(q => ({
          key: q.id,
          label: eventTypeById[q.id] ? eventTypeDisplayLabel(eventTypeById[q.id], t) : q.id,
          icon: q.icon,
          iconFamily: q.iconFamily,
        })),
    [settings.quickAddTypes, eventTypeById, t, settings.language],
  );

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const events = getForDate(dateStr);
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  if (dragActive && frozenEventsRef.current !== null && frozenDateRef.current !== dateStr) {
    const dragged = dragEvent
      ? frozenEventsRef.current.find(e => e.id === dragEvent.id) ?? null
      : null;
    const base = events.filter(e => e.id !== dragEvent?.id);
    frozenEventsRef.current = dragged ? [...base, dragged] : base;
    frozenDateRef.current = dateStr;
  }

  useEffect(() => {
    if (!showMonthPicker) setPickerMonth(selectedDate);
  }, [selectedDate]);

  // The day chevrons, WeekStrip, and month picker all still work during
  // selection. A selection scoped to a day that's no longer on screen doesn't
  // mean anything, so drop it — except mid-drag, where the day can change
  // from edge-scrolling and the gesture still needs to land.
  const prevDateStrRef = useRef(dateStr);
  useEffect(() => {
    if (prevDateStrRef.current === dateStr) return;
    prevDateStrRef.current = dateStr;
    if (selectMode && !dragActive) exitSelectMode();
  }, [dateStr, dragActive]);

  // Tab screens stay mounted when you leave them, so select mode would still be
  // on when you tab back. Drop it on blur — the cleanup of a focus effect.
  useFocusEffect(useCallback(() => () => exitSelectMode(), []));

  // An event-reminder notification tap lands here (see App.tsx) with the
  // occurrence's date — jump to that day. Consumed once and cleared, same as
  // HomeScreen's openUnreported param.
  useEffect(() => {
    const eventDate = (route?.params as { eventDate?: string } | undefined)?.eventDate;
    if (!eventDate) return;

    setSelectedDate(new Date(eventDate + 'T12:00:00'));
    navigation?.setParams({ eventDate: undefined });
  }, [route?.params?.eventDate]);

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);
  const edgeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function getEdgeZone(): 'left' | 'right' | null {
    if (!dragActive) return null;
    if (ghostX < EDGE_ZONE) return 'left';
    if (ghostX > SCREEN_WIDTH - EDGE_ZONE) return 'right';
    return null;
  }
  const edgeZone = getEdgeZone();

  useEffect(() => {
    if (edgeZone === null) {
      if (edgeIntervalRef.current) {
        clearInterval(edgeIntervalRef.current);
        edgeIntervalRef.current = null;
      }
      return;
    }

    edgeIntervalRef.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedDate(d => edgeZone === 'left' ? addDays(d, -1) : addDays(d, 1));
    }, 500);

    return () => {
      if (edgeIntervalRef.current) {
        clearInterval(edgeIntervalRef.current);
        edgeIntervalRef.current = null;
      }
    };
  }, [edgeZone]);

  function handleEventPress(event: CalendarEvent) {
    setEditingEvent(event);
    setDefaultStartTime(undefined);
    setPrefill(null);
    setShowEventModal(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedEventIds(new Set());
  }

  function toggleEventSelected(event: CalendarEvent) {
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(event.id)) next.delete(event.id); else next.add(event.id);
      return next;
    });
  }

  function handleDeleteSelected() {
    const ids = Array.from(selectedEventIds);
    if (ids.length === 0) return;
    Alert.alert(
      t('calendar.deleteEventsTitle'),
      t('calendar.deleteEventsBody', { count: ids.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            for (const id of ids) {
              const ev = events.find(e => e.id === id);
              if (ev) await deleteOccurrence(ev.id, ev.date);
            }
            exitSelectMode();
          },
        },
      ],
    );
  }

  function handleAddEvent() {
    setEditingEvent(null);
    setDefaultStartTime(undefined);
    setPrefill(null);
    setShowEventModal(true);
  }

  // Read at tap rather than kept in state: the stack can sit open for a while,
  // and the time that matters is the one at the moment the type is chosen.
  // The date still comes from the day on screen, so picking a bubble while
  // looking at next Tuesday puts the event on next Tuesday at this hour.
  function handleQuickAdd(type: string) {
    setEditingEvent(null);
    setDefaultStartTime(undefined);
    setPrefill({ type, startTime: nextHalfHour() });
    setShowEventModal(true);
  }

  function handleTapEmpty(timeStr: string) {
    setPendingTapTime(timeStr);
  }

  function handleTypeSelected(type: string) {
    const timeStr = pendingTapTime;
    setPendingTapTime(null);
    setEditingEvent(null);
    setDefaultStartTime(undefined);
    setPrefill({ type, startTime: timeStr ?? nextHalfHour() });
    setShowEventModal(true);
  }

  async function handleSaveEvent(eventData: Omit<CalendarEvent, 'id'>, scope?: 'single' | 'future') {
    if (editingEvent) {
      if (scope === 'single') await updateOccurrence(editingEvent.id, editingEvent.date, eventData);
      else if (scope === 'future') await updateFromDate(editingEvent.id, editingEvent.date, eventData);
      else await updateEvent(editingEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }
  }

  function handleDragStart(event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffset: number) {
    frozenEventsRef.current = events;
    frozenDateRef.current = dateStr;
    // Dragging a block that's part of the current selection moves the whole
    // group; dragging any other block (selection off, or this block not in it)
    // is an ordinary single-event drag, so no snapshot is needed.
    if (selectMode && selectedEventIds.has(event.id)) {
      const map: NonNullable<typeof groupDragOriginalRef.current> = new Map();
      for (const id of selectedEventIds) {
        const ev = events.find(e => e.id === id);
        if (ev) map.set(id, {
          date: ev.date, startTime: ev.startTime, endTime: ev.endTime, hasEnd: hasEndTime(ev), recurring: ev.recurring,
          title: ev.title, color: ev.color,
          topOffset: eventTopOffset(ev.startTime, settings.gridStartHour, SLOT_HEIGHT),
          height: renderedEventHeight(ev, SLOT_HEIGHT),
        });
      }
      groupDragOriginalRef.current = map;
    } else {
      groupDragOriginalRef.current = null;
    }
    startDrag(event, x, y, width, height, grabOffset, groupDragOriginalRef.current ? Array.from(groupDragOriginalRef.current.keys()) : undefined);
  }

  function handleDragCancel() {
    frozenEventsRef.current = null;
    frozenDateRef.current = null;
    groupDragOriginalRef.current = null;
    endDrag();
  }

  function timeToMinutes(t: string): number {
    const { hour, minute } = parseTimeString(t);
    return hour * 60 + minute;
  }

  // Matches the single-drag clamp above (`Math.min(hour, 23)`): a drop never
  // wraps a time across midnight, it just pins to the last minute of the day.
  function minutesToClampedTime(mins: number): string {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
    return formatTime(Math.floor(clamped / 60), clamped % 60);
  }

  type PendingMove = { id: string; origDate: string; recurring: boolean; changes: Partial<CalendarEvent> };

  // A recurring row's date/time is the whole series' anchor, not one
  // occurrence's own — so a drag on one has to ask which occurrences it moves
  // before anything is written, the same question and the same two answers
  // handleDelete already asks. Cancelling leaves the series untouched: nothing
  // below writes anything until a scope is picked.
  function applyMove(move: PendingMove, scope?: 'single' | 'future') {
    if (!move.recurring || !scope) {
      updateEvent(move.id, move.changes);
      return;
    }
    if (scope === 'single') updateOccurrence(move.id, move.origDate, move.changes);
    else updateFromDate(move.id, move.origDate, move.changes);
  }

  function commitMoves(moves: PendingMove[]) {
    if (!moves.some(m => m.recurring)) {
      moves.forEach(m => applyMove(m));
      return;
    }
    Alert.alert(
      t('calendar.recurringEventTitle'),
      t('calendar.recurringMoveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('calendar.thisEventOnly'), onPress: () => moves.forEach(m => applyMove(m, 'single')) },
        { text: t('calendar.thisAndAllFuture'), onPress: () => moves.forEach(m => applyMove(m, 'future')) },
      ],
      { cancelable: true }
    );
  }

  function handleDragDrop(absoluteY: number, gridTopY: number, scrollOffset: number) {
    frozenEventsRef.current = null;
    frozenDateRef.current = null;
    const group = groupDragOriginalRef.current;
    groupDragOriginalRef.current = null;
    if (!dragEvent) { endDrag(); return; }
    const relativeY = absoluteY - grabOffsetY - gridTopY + scrollOffset;
    const fifteenMinSlot = Math.max(0, Math.floor(relativeY / DRAG_SLOT_HEIGHT));
    const hour = Math.floor(fifteenMinSlot / 4) + settings.gridStartHour;
    const minute = (fifteenMinSlot % 4) * 15;
    const newStart = formatTime(Math.min(hour, 23), minute);
    // Events with no duration — checkbox types, and contacts logged without an
    // end — keep end equal to the new start, which is how "no end" is stored.
    let newEnd = newStart;
    if (hasEndTime(dragEvent)) {
      const { hour: sh, minute: sm } = parseTimeString(dragEvent.startTime);
      const { hour: eh, minute: em } = parseTimeString(dragEvent.endTime);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const durationMins = Math.max(endMins > startMins ? endMins - startMins : endMins + 1440 - startMins, 15);
      newEnd = addMinutesToTimeString(newStart, durationMins);
    }

    // Every event the drop touches, keyed by its own pre-drag date — the
    // anchor plus, for a group drag, the rest of the selection replaying the
    // anchor's move off each event's own snapshot.
    const moves: PendingMove[] = [
      { id: dragEvent.id, origDate: dragEvent.date, recurring: dragEvent.recurring, changes: { startTime: newStart, endTime: newEnd, date: dateStr } },
    ];

    // The rest of the group replays the anchor's own move — same day offset,
    // same minute offset — off each event's pre-drag date/time, preserving its
    // own duration rather than taking on the anchor's.
    const anchorOriginal = group?.get(dragEvent.id);
    if (group && anchorOriginal) {
      const deltaMinutes = timeToMinutes(newStart) - timeToMinutes(anchorOriginal.startTime);
      const deltaDays = differenceInCalendarDays(parseISO(dateStr), parseISO(anchorOriginal.date));
      for (const [id, orig] of group) {
        if (id === dragEvent.id) continue;
        const origStartMins = timeToMinutes(orig.startTime);
        const origEndMins = timeToMinutes(orig.endTime);
        const durationMins = orig.hasEnd
          ? Math.max(origEndMins > origStartMins ? origEndMins - origStartMins : origEndMins + 1440 - origStartMins, 15)
          : 0;
        const siblingStart = minutesToClampedTime(origStartMins + deltaMinutes);
        const siblingEnd = orig.hasEnd ? minutesToClampedTime(timeToMinutes(siblingStart) + durationMins) : siblingStart;
        const siblingDate = format(addDays(parseISO(orig.date), deltaDays), 'yyyy-MM-dd');
        moves.push({ id, origDate: orig.date, recurring: orig.recurring, changes: { date: siblingDate, startTime: siblingStart, endTime: siblingEnd } });
      }
    }

    endDrag();
    commitMoves(moves);
  }

  // The grid draws one drop-target shadow per selected event, not just for the
  // block being held — so grabbing the bottom of three still previews all three
  // landing spots. Offsets come off the same pre-drag snapshot as the ghosts,
  // and a selection can never span days (see the day-change effect above), so
  // every member lands on the day the drag is currently over.
  function groupShadowOffsets() {
    const group = groupDragOriginalRef.current;
    if (!dragActive || !dragEvent || !group) return undefined;
    const anchor = group.get(dragEvent.id);
    if (!anchor) return undefined;
    return Array.from(group.entries())
      .filter(([id]) => id !== dragEvent.id)
      .map(([id, sib]) => ({ id, offsetY: sib.topOffset - anchor.topOffset, height: sib.height }));
  }

  function renderGhostBlock(key: string, color: string, title: string, height: number, topPx: number) {
    return (
      <View
        key={key}
        style={[styles.ghostOverlay, { left: ghostX - ghostWidth * 0.25, top: topPx, width: ghostWidth }]}
        pointerEvents="none"
      >
        <View style={[styles.ghostBlock, { backgroundColor: Colors.card, height }]}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color + '55' }]} />
          <View style={[styles.ghostAccentBar, { backgroundColor: color }]} />
          <Text style={[styles.ghostTitle, { color: Colors.text, fontSize: eventFontSize }]} numberOfLines={1}>{title}</Text>
        </View>
      </View>
    );
  }

  function handleSwipeWeek(dir: 1 | -1) {
    setSelectedDate(d => addDays(d, dir * 7));
  }

  function getMonthGrid(month: Date): (Date | null)[][] {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const weekStartsOn = settings.weekStart === 'monday' ? 1 : 0;
    let startDow = firstDay.getDay();
    if (weekStartsOn === 1) startDow = (startDow + 6) % 7;
    const cells: (Date | null)[] = Array(startDow).fill(null);
    for (let d = 0; d < daysInMonth; d++) cells.push(addDays(firstDay, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  function navigatePickerMonth(dir: 1 | -1) {
    setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  }

  function handlePickerDayPress(day: Date) {
    setSelectedDate(day);
    setShowMonthPicker(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header} onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{format(selectedDate, datePattern('monthDay', settings.language), { locale: dateFnsLocale(settings.language) })}</Text>
          <Text style={styles.headerYear}>{yearLabel(selectedDate, settings.language)}</Text>
          <TouchableOpacity onPress={() => setShowMonthPicker(v => !v)} style={styles.chevronBtn}>
            <Ionicons name={showMonthPicker ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.onPrimaryMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} style={styles.calendarIconBtn}>
            <Ionicons name="calendar-outline" size={20} color={Colors.onPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          {/* Only shows once there's something to act on — tapping it is the
              only way to delete a selection, so it has no disabled state. */}
          {selectMode && selectedEventIds.size > 0 && (
            <TouchableOpacity
              onPress={handleDeleteSelected}
              style={styles.navBtn}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.deleteSelectedEvents')}
            >
              <Ionicons name="trash-outline" size={22} color={Colors.onPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            style={styles.navBtn}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.selectEvents')}
          >
            <Ionicons name={selectMode ? 'checkbox' : 'checkbox-outline'} size={22} color={Colors.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(d => subDays(d, 1))} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(d => addDays(d, 1))} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={Colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <WeekStrip
        selectedDate={selectedDate}
        weekStart={settings.weekStart}
        onSelectDate={setSelectedDate}
        onSwipeWeek={handleSwipeWeek}
      />

      <View style={styles.gridContainer}>
        <DayPager
          selectedDate={selectedDate}
          onChangeDate={(dir) => setSelectedDate(d => addDays(d, dir))}
          scrollEnabled={!dragActive}
          renderDay={(ds, role) => {
            if (role === 'current') {
              return (
                <TimeGrid
                  events={frozenEventsRef.current ?? events}
                  getStatus={getStatus}
                  onEventPress={handleEventPress}
                  onToggleStatus={(ev) => report(ev, getStatus(ev.id, ev.date) === 'completed' ? undefined : 'completed')}
                  onTapEmpty={selectMode ? () => {} : handleTapEmpty}
                  onDragStart={handleDragStart}
                  onDragMove={moveDrag}
                  onDragEnd={handleDragDrop}
                  onDragCancel={handleDragCancel}
                  dragHoverY={dragActive ? ghostY : null}
                  dragGrabOffsetY={grabOffsetY}
                  dragEventHeight={dragActive && dragEvent ? renderedEventHeight(dragEvent, SLOT_HEIGHT) : undefined}
                  dragGroupShadows={groupShadowOffsets()}
                  gridStartHour={settings.gridStartHour}
                  gridEndHour={settings.gridEndHour}
                  slotHeight={SLOT_HEIGHT}
                  eventFontSize={eventFontSize}
                  isToday={isToday}
                  initialScrollY={syncScrollY}
                  onScrollSettle={setSyncScrollY}
                  bounceEnabled={!dragActive}
                  selectMode={selectMode}
                  selectedEventIds={selectedEventIds}
                  onToggleEventSelect={toggleEventSelected}
                />
              );
            }
            return (
              <TimeGrid
                events={getForDate(ds)}
                getStatus={getStatus}
                onTapEmpty={() => {}}
                gridStartHour={settings.gridStartHour}
                gridEndHour={settings.gridEndHour}
                slotHeight={SLOT_HEIGHT}
                eventFontSize={eventFontSize}
                isToday={ds === format(new Date(), 'yyyy-MM-dd')}
                initialScrollY={syncScrollY}
                syncScrollY={syncScrollY}
              />
            );
          }}
        />
      </View>

      {dragActive && dragEvent && renderGhostBlock('anchor', dragEvent.color, dragEvent.title, ghostHeight, ghostY - grabOffsetY)}
      {/* Every other selected event gets its own ghost, offset from the anchor's
          live position by the same pixel gap it started with — so a group drag
          visibly carries the whole selection, not just the block that was grabbed. */}
      {dragActive && dragEvent && groupDragOriginalRef.current && (() => {
        const group = groupDragOriginalRef.current;
        const anchorEntry = group.get(dragEvent.id);
        if (!anchorEntry) return null;
        return Array.from(group.entries())
          .filter(([id]) => id !== dragEvent.id)
          .map(([id, sib]) => renderGhostBlock(
            id, sib.color, sib.title, sib.height,
            ghostY - grabOffsetY + (sib.topOffset - anchorEntry.topOffset),
          ));
      })()}

      {showMonthPicker && (
        <>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            onPress={() => setShowMonthPicker(false)}
            activeOpacity={1}
          />
          <View style={[styles.pickerPanel, { top: headerBottom }]}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => navigatePickerMonth(-1)} style={styles.pickerNavBtn}>
                <Ionicons name="chevron-back" size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.pickerMonthTitle}>{format(pickerMonth, 'MMMM yyyy', { locale: dateFnsLocale(settings.language) })}</Text>
              <TouchableOpacity onPress={() => navigatePickerMonth(1)} style={styles.pickerNavBtn}>
                <Ionicons name="chevron-forward" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerDayHeaders}>
              {weekdayShortLabels(settings.weekStart, t).map((d, i) => <Text key={i} style={styles.pickerDayHeader}>{d}</Text>)}
            </View>
            {getMonthGrid(pickerMonth).map((week, wi) => (
              <View key={wi} style={styles.pickerWeek}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.pickerDayCell} />;
                  const ds = format(day, 'yyyy-MM-dd');
                  const isSelected = ds === format(selectedDate, 'yyyy-MM-dd');
                  const isTodayDate = ds === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[styles.pickerDayCell, isSelected && styles.pickerDayCellSelected]}
                      onPress={() => handlePickerDayPress(day)}
                    >
                      <Text style={[
                        styles.pickerDayText,
                        isTodayDate && !isSelected && styles.pickerDayTextToday,
                        isSelected && styles.pickerDayTextSelected,
                      ]}>
                        {format(day, 'd')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </>
      )}

      {!selectMode && <FAB onPress={handleAddEvent} actions={quickActions} onSelectAction={handleQuickAdd} />}

      <EventTypeSheet
        visible={pendingTapTime !== null}
        onSelect={handleTypeSelected}
        onClose={() => setPendingTapTime(null)}
      />

      <AddEditEventModal
        visible={showEventModal}
        event={editingEvent}
        defaultDate={dateStr}
        defaultStartTime={defaultStartTime}
        prefill={prefill}
        settings={settings}
        currentStatus={editingEvent ? getStatus(editingEvent.id, editingEvent.date) : undefined}
        onStatusChange={editingEvent ? (s) => report(editingEvent, s) : undefined}
        onSave={handleSaveEvent}
        onDelete={(id, occurrenceDate, mode) =>
          mode === 'future' ? deleteFromDate(id, occurrenceDate) : deleteOccurrence(id, occurrenceDate)
        }
        onClose={() => setShowEventModal(false)}
      />
    </SafeAreaView>
  );
}

export function CalendarScreen({ route, navigation }: any) {
  return (
    <DragProvider>
      <CalendarContent route={route} navigation={navigation} />
    </DragProvider>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerDate: {
      fontSize: 20,
      fontWeight: '700',
      color: C.onPrimary,
    },
    headerYear: {
      fontSize: 14,
      color: C.onPrimaryMuted,
      fontWeight: '400',
    },
    calendarIconBtn: {
      padding: 4,
      marginLeft: 2,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    navBtn: {
      padding: 4,
    },
    chevronBtn: {
      padding: 4,
    },
    pickerBackdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100,
    },
    pickerPanel: {
      position: 'absolute',
      left: 12,
      right: 12,
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 12,
      zIndex: 101,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    pickerNavBtn: {
      padding: 6,
    },
    pickerMonthTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
    },
    pickerDayHeaders: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    pickerDayHeader: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '600',
      color: C.textLight,
    },
    pickerWeek: {
      flexDirection: 'row',
    },
    pickerDayCell: {
      flex: 1,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerDayCellSelected: {
      backgroundColor: C.primary,
      borderRadius: 18,
    },
    pickerDayText: {
      fontSize: 13,
      color: C.text,
    },
    pickerDayTextToday: {
      color: C.primary,
      fontWeight: '700',
    },
    pickerDayTextSelected: {
      // Sits on a `primary` pill, so it follows the theme colour's ink.
      color: C.onPrimary,
      fontWeight: '700',
    },
    gridContainer: {
      flex: 1,
      backgroundColor: C.card,
    },
    ghostOverlay: {
      position: 'absolute',
      zIndex: 999,
    },
    // No drop shadow: a group drag draws one ghost per selected event, and with
    // blocks that sit back to back each shadow falls on the neighbour below
    // instead of on the grid, so only whichever block ends up bottom-most looks
    // lifted. Flat reads as one moving selection rather than an uneven stack.
    ghostBlock: {
      borderRadius: 4,
      paddingLeft: 11,
      paddingRight: 8,
      paddingVertical: 4,
      justifyContent: 'flex-start',
      overflow: 'hidden',
    },
    ghostAccentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
    },
    ghostTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
