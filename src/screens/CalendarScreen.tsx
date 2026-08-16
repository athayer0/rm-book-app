import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import { type ColorPalette } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { TimeGrid } from '../components/TimeGrid';
import { DayPager } from '../components/DayPager';
import { WeekStrip } from '../components/WeekStrip';
import { FAB, type FABAction } from '../components/FAB';
import { AddEditEventModal } from '../modals/AddEditEventModal';
import { EventTypeSheet } from '../modals/EventTypeSheet';
import { CalendarEvent, renderedEventHeight, hasEndTime } from '../utils/eventUtils';
import { EventSizes, resolveEventSize } from '../constants/eventSizes';
import { DragProvider, useDrag } from '../components/DragContext';
import { useEventReport } from '../hooks/useEventReport';
import { addMinutesToTimeString, formatTime, nextHalfHour, parseTimeString } from '../utils/dateUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const EDGE_ZONE = 60;

/**
 * The types that earn a bubble off the +, in stack order — first entry nearest
 * the thumb, climbing from there. A hand-picked list rather than a usage count
 * on purpose: the value is that the same type is always in the same place under
 * your thumb, which an order that recomputes itself can't promise. Add or drop
 * entries here — anything left off is still one long press on the + away.
 */
const QUICK_ADD_TYPES = ['travel', 'activity', 'date', 'temple', 'contact', 'task'];

function CalendarContent({ route, navigation }: { route?: any; navigation?: any }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

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
  const { getForDate, addEvent, updateEvent, deleteOccurrence, deleteFromDate } = useCalendarEvents();
  const { settings } = useSettings();
  const { byId: eventTypeById } = useEventTypeDefinitions();
  const { getStatus, report } = useEventReport();
  const { active: dragActive, event: dragEvent, ghostX, ghostY, ghostWidth, ghostHeight, grabOffsetY, endDrag, startDrag, moveDrag } = useDrag();
  const frozenEventsRef = useRef<CalendarEvent[] | null>(null);
  const frozenDateRef = useRef<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [headerBottom, setHeaderBottom] = useState(60);
  // Shared vertical scroll offset so every day page stays aligned to the same time-of-day.
  const [syncScrollY, setSyncScrollY] = useState(0);

  const { slotHeight: SLOT_HEIGHT, fontSize: eventFontSize } = EventSizes[resolveEventSize(settings.eventSize)];
  const DRAG_SLOT_HEIGHT = SLOT_HEIGHT / 2;

  // The bubbles take their colour from the button, not from the type, so only
  // label/icon vary — and only with which types are currently visible.
  const quickActions = useMemo<FABAction[]>(
    () =>
      QUICK_ADD_TYPES.filter(type => eventTypeById[type]?.visible !== false).map(type => ({
        key: type,
        label: eventTypeById[type]?.label ?? type,
        icon: eventTypeById[type]?.icon ?? 'ellipse',
        iconFamily: eventTypeById[type]?.iconFamily,
      })),
    [eventTypeById],
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

  async function handleSaveEvent(eventData: Omit<CalendarEvent, 'id'>) {
    if (editingEvent) {
      await updateEvent(editingEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }
  }

  function handleDragStart(event: CalendarEvent, x: number, y: number, width: number, height: number, grabOffset: number) {
    frozenEventsRef.current = events;
    frozenDateRef.current = dateStr;
    startDrag(event, x, y, width, height, grabOffset);
  }

  function handleDragCancel() {
    frozenEventsRef.current = null;
    frozenDateRef.current = null;
    endDrag();
  }

  function handleDragDrop(absoluteY: number, gridTopY: number, scrollOffset: number) {
    frozenEventsRef.current = null;
    frozenDateRef.current = null;
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
    updateEvent(dragEvent.id, { startTime: newStart, endTime: newEnd, date: dateStr });
    endDrag();
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
          <Text style={styles.headerDate}>{format(selectedDate, 'MMM d')}</Text>
          <Text style={styles.headerYear}>{format(selectedDate, 'yyyy')}</Text>
          <TouchableOpacity onPress={() => setShowMonthPicker(v => !v)} style={styles.chevronBtn}>
            <Ionicons name={showMonthPicker ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.onPrimaryMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} style={styles.calendarIconBtn}>
            <Ionicons name="calendar-outline" size={20} color={Colors.onPrimaryMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
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
                  onTapEmpty={handleTapEmpty}
                  onDragStart={handleDragStart}
                  onDragMove={moveDrag}
                  onDragEnd={handleDragDrop}
                  onDragCancel={handleDragCancel}
                  dragHoverY={dragActive ? ghostY : null}
                  dragGrabOffsetY={grabOffsetY}
                  dragEventHeight={dragActive && dragEvent ? renderedEventHeight(dragEvent, SLOT_HEIGHT) : undefined}
                  gridStartHour={settings.gridStartHour}
                  gridEndHour={settings.gridEndHour}
                  slotHeight={SLOT_HEIGHT}
                  eventFontSize={eventFontSize}
                  isToday={isToday}
                  initialScrollY={syncScrollY}
                  onScrollSettle={setSyncScrollY}
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

      {dragActive && dragEvent && (
        <View
          style={[styles.ghostOverlay, { left: ghostX - ghostWidth * 0.25, top: ghostY - grabOffsetY, width: ghostWidth }]}
          pointerEvents="none"
        >
          <View style={[styles.ghostBlock, { backgroundColor: Colors.card, borderLeftColor: dragEvent.color, height: ghostHeight }]}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dragEvent.color + '55' }]} />
            <Text style={[styles.ghostTitle, { color: Colors.text, fontSize: eventFontSize }]} numberOfLines={1}>{dragEvent.title}</Text>
          </View>
        </View>
      )}

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
              <Text style={styles.pickerMonthTitle}>{format(pickerMonth, 'MMMM yyyy')}</Text>
              <TouchableOpacity onPress={() => navigatePickerMonth(1)} style={styles.pickerNavBtn}>
                <Ionicons name="chevron-forward" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerDayHeaders}>
              {(settings.weekStart === 'monday'
                ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
              ).map(d => <Text key={d} style={styles.pickerDayHeader}>{d}</Text>)}
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

      <FAB onPress={handleAddEvent} actions={quickActions} onSelectAction={handleQuickAdd} />

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
    ghostBlock: {
      borderLeftWidth: 3,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      justifyContent: 'flex-start',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 8,
    },
    ghostTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
