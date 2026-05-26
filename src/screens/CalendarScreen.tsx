import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays } from 'date-fns';
import { Colors } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useSettings } from '../hooks/useSettings';
import { TimeGrid } from '../components/TimeGrid';
import { WeekStrip } from '../components/WeekStrip';
import { FAB } from '../components/FAB';
import { AddEditEventModal } from '../modals/AddEditEventModal';
import { CalendarEvent, EventStatus, getKIContribution } from '../utils/eventUtils';
import { DragProvider, useDrag } from '../components/DragContext';
import { useEventStatuses } from '../hooks/useEventStatuses';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { isInCurrentWeek } from '../utils/dateUtils';
import { addMinutesToTimeString, formatTime } from '../utils/dateUtils';
import { EventTypeConfig } from '../constants/colors';

const SLOT_HEIGHT = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;
const EDGE_ZONE = 60;

function CalendarContent() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>();
  const { getForDate, addEvent, updateEvent, deleteEvent, toggleComplete } = useCalendarEvents();
  const { settings } = useSettings();
  const { getStatus, setStatus } = useEventStatuses();
  const { adjustCount } = useWeeklyIndicators();
  const { active: dragActive, event: dragEvent, ghostX, ghostY, endDrag, startDrag, moveDrag } = useDrag();
  const frozenEventsRef = useRef<CalendarEvent[] | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [headerBottom, setHeaderBottom] = useState(60);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const prevDateStr = format(addDays(selectedDate, -1), 'yyyy-MM-dd');
  const nextDateStr = format(addDays(selectedDate,  1), 'yyyy-MM-dd');
  const events     = getForDate(dateStr);
  const prevEvents = getForDate(prevDateStr);
  const nextEvents = getForDate(nextDateStr);
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  // Animated value lives at -SCREEN_WIDTH at rest (center pane visible).
  // Swiping left → goes more negative (next pane slides in).
  // Swiping right → goes toward 0 (prev pane slides in).
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const [currentScrollY, setCurrentScrollY] = useState(0);
  const [committedDate, setCommittedDate] = useState(new Date());
  const pendingResetRef = useRef(false);

  // Keep committedDate in sync when date changes via nav buttons, week strip, today, etc.
  useEffect(() => {
    setCommittedDate(selectedDate);
  }, [selectedDate]);

  // Sync picker month to selected date when picker is closed.
  useEffect(() => {
    if (!showMonthPicker) setPickerMonth(selectedDate);
  }, [selectedDate]);

  // Reset translateX AFTER React commits new pane content — eliminates the flash frame.
  useLayoutEffect(() => {
    if (pendingResetRef.current) {
      pendingResetRef.current = false;
      translateX.setValue(-SCREEN_WIDTH);
    }
  }, [selectedDate]);

  // Snap row back to center if the swipe gesture partially moved it before drag activated.
  useEffect(() => {
    if (dragActive) {
      Animated.spring(translateX, {
        toValue: -SCREEN_WIDTH,
        useNativeDriver: true,
        tension: 40,
        friction: 8,
      }).start();
    }
  }, [dragActive]);

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);
  const edgeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function getEdgeZone(): 'left' | 'right' | null {
    if (!dragActive) return null;
    if (ghostX < EDGE_ZONE) return 'left';
    if (ghostX > SCREEN_WIDTH - EDGE_ZONE) return 'right';
    return null;
  }
  const edgeZone = getEdgeZone();

  // Edge-scroll while dragging — interval only resets when entering/leaving the zone.
  useEffect(() => {
    if (edgeZone === null) {
      if (edgeIntervalRef.current) {
        clearInterval(edgeIntervalRef.current);
        edgeIntervalRef.current = null;
      }
      return;
    }

    edgeIntervalRef.current = setInterval(() => {
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
    setShowEventModal(true);
  }

  function handleAddEvent() {
    setEditingEvent(null);
    setDefaultStartTime(undefined);
    setShowEventModal(true);
  }

  function handleTapEmpty(timeStr: string) {
    setEditingEvent(null);
    setDefaultStartTime(timeStr);
    setShowEventModal(true);
  }

  async function handleStatusChange(event: CalendarEvent, newStatus: EventStatus | undefined) {
    const prevStatus = getStatus(event.id, event.date);
    if (isInCurrentWeek(event.date)) {
      const contrib = getKIContribution(event);
      if (contrib) {
        if (prevStatus === 'completed') await adjustCount(contrib.kiId, -contrib.delta);
        if (newStatus === 'completed')  await adjustCount(contrib.kiId, +contrib.delta);
      }
    }
    await setStatus(event.id, event.date, newStatus);
  }

  async function handleSaveEvent(eventData: Omit<CalendarEvent, 'id'>) {
    if (editingEvent) {
      await updateEvent(editingEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }
  }

  function handleDragStart(event: CalendarEvent, x: number, y: number) {
    frozenEventsRef.current = events;
    startDrag(event, x, y);
  }

  function handleDragCancel() {
    frozenEventsRef.current = null;
    endDrag();
  }

  function handleDragDrop(absoluteY: number, gridTopY: number, scrollOffset: number) {
    frozenEventsRef.current = null;
    if (!dragEvent) { endDrag(); return; }
    const relativeY = absoluteY - SLOT_HEIGHT - gridTopY + scrollOffset;
    const thirtyMinSlot = Math.max(0, Math.floor(relativeY / SLOT_HEIGHT));
    const hour = Math.floor(thirtyMinSlot / 2) + settings.gridStartHour;
    const minute = (thirtyMinSlot % 2) * 30;
    const newStart = formatTime(Math.min(hour, 23), minute);
    const config = EventTypeConfig[dragEvent.type];
    const durationMins = config?.defaultMinutes === 0 ? 15 :
      (settings.eventTypeDefaultMinutes[dragEvent.type] ?? config?.defaultMinutes ?? 30);
    const newEnd = addMinutesToTimeString(newStart, durationMins);
    updateEvent(dragEvent.id, { startTime: newStart, endTime: newEnd, date: dateStr });
    endDrag();
  }

  function handleDayDrop(date: Date) {
    frozenEventsRef.current = null;
    if (!dragEvent) { endDrag(); return; }
    updateEvent(dragEvent.id, { date: format(date, 'yyyy-MM-dd') });
    endDrag();
  }

  function handleSwipeProgress(x: number) {
    translateX.setValue(-SCREEN_WIDTH + x);
  }

  function handleSwipeCancel() {
    Animated.spring(translateX, {
      toValue: -SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();
  }

  function handleSwipeDay(dir: 1 | -1) {
    setCommittedDate(d => addDays(d, dir));
    const target = dir === 1 ? -SCREEN_WIDTH * 2 : 0;
    Animated.spring(translateX, {
      toValue: target,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start(() => {
      pendingResetRef.current = true;
      setSelectedDate(d => addDays(d, dir));
    });
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
      {/* Header */}
      <View style={styles.header} onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{format(committedDate, 'MMM d')}</Text>
          <Text style={styles.headerYear}>{format(committedDate, 'yyyy')}</Text>
          <TouchableOpacity onPress={() => setShowMonthPicker(v => !v)} style={styles.chevronBtn}>
            <Ionicons name={showMonthPicker ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} style={styles.calendarIconBtn}>
            <Ionicons name="calendar-outline" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSelectedDate(d => subDays(d, 1))} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(d => addDays(d, 1))} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Week strip */}
      <WeekStrip
        selectedDate={selectedDate}
        weekStart={settings.weekStart}
        onSelectDate={setSelectedDate}
        onSwipeWeek={handleSwipeWeek}
        draggingEvent={dragActive ? dragEvent : null}
        onDayDrop={handleDayDrop}
      />

      {/* Time grid — 3-pane sliding row */}
      <View style={styles.gridContainer}>
        <Animated.View style={[styles.gridRow, { transform: [{ translateX }] }]}>
          <View style={{ width: SCREEN_WIDTH }}>
            <TimeGrid
              events={prevEvents}
              getStatus={getStatus}
              onTapEmpty={() => {}}
              onSwipeDay={handleSwipeDay}
              onSwipeProgress={handleSwipeProgress}
              onSwipeCancel={handleSwipeCancel}
              dragActive={dragActive}
              initialScrollY={currentScrollY}
              restoreKey={prevDateStr}
              gridStartHour={settings.gridStartHour}
              gridEndHour={settings.gridEndHour}
            />
          </View>
          <View style={{ width: SCREEN_WIDTH }}>
            <TimeGrid
              events={frozenEventsRef.current ?? events}
              getStatus={getStatus}
              onEventPress={handleEventPress}
              onToggleComplete={toggleComplete}
              onTapEmpty={handleTapEmpty}
              onSwipeDay={handleSwipeDay}
              onSwipeProgress={handleSwipeProgress}
              onSwipeCancel={handleSwipeCancel}
              onDragStart={handleDragStart}
              onDragMove={moveDrag}
              onDragEnd={handleDragDrop}
              onDragCancel={handleDragCancel}
              dragHoverY={dragActive ? ghostY : null}
              initialScrollY={currentScrollY}
              restoreKey={dateStr}
              onScrollChange={setCurrentScrollY}
              gridStartHour={settings.gridStartHour}
              gridEndHour={settings.gridEndHour}
            />
          </View>
          <View style={{ width: SCREEN_WIDTH }}>
            <TimeGrid
              events={nextEvents}
              getStatus={getStatus}
              onTapEmpty={() => {}}
              onSwipeDay={handleSwipeDay}
              onSwipeProgress={handleSwipeProgress}
              onSwipeCancel={handleSwipeCancel}
              dragActive={dragActive}
              initialScrollY={currentScrollY}
              restoreKey={nextDateStr}
              gridStartHour={settings.gridStartHour}
              gridEndHour={settings.gridEndHour}
            />
          </View>
        </Animated.View>
      </View>

      {/* Drag ghost overlay */}
      {dragActive && dragEvent && (
        <View
          style={[styles.ghostOverlay, { left: ghostX - 80, top: ghostY }]}
          pointerEvents="none"
        >
          <View style={[styles.ghostBlock, { backgroundColor: dragEvent.color + 'EE', borderLeftColor: dragEvent.color }]}>
            <Text style={styles.ghostTitle} numberOfLines={1}>{dragEvent.title}</Text>
          </View>
        </View>
      )}

      {/* Month picker dropdown */}
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
                  const isToday = ds === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[styles.pickerDayCell, isSelected && styles.pickerDayCellSelected]}
                      onPress={() => handlePickerDayPress(day)}
                    >
                      <Text style={[
                        styles.pickerDayText,
                        isToday && !isSelected && styles.pickerDayTextToday,
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

      {/* FAB */}
      <FAB onPress={handleAddEvent} />

      {/* Event modal */}
      <AddEditEventModal
        visible={showEventModal}
        event={editingEvent}
        defaultDate={dateStr}
        defaultStartTime={defaultStartTime}
        settings={settings}
        currentStatus={editingEvent ? getStatus(editingEvent.id, editingEvent.date) : undefined}
        onStatusChange={editingEvent ? (s) => handleStatusChange(editingEvent, s) : undefined}
        onSave={handleSaveEvent}
        onDelete={deleteEvent}
        onClose={() => setShowEventModal(false)}
      />
    </SafeAreaView>
  );
}

export function CalendarScreen() {
  return (
    <DragProvider>
      <CalendarContent />
    </DragProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerDate: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
  },
  headerYear: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
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
    backgroundColor: Colors.white,
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
    color: Colors.text,
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
    color: Colors.textLight,
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
    backgroundColor: Colors.primary,
    borderRadius: 18,
  },
  pickerDayText: {
    fontSize: 13,
    color: Colors.text,
  },
  pickerDayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
  pickerDayTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  gridContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * 3,
  },
  ghostOverlay: {
    position: 'absolute',
    width: 160,
    zIndex: 999,
  },
  ghostBlock: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 30,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  ghostTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
});
