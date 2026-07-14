import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useSettings } from '../hooks/useSettings';
import { TimeGrid } from '../components/TimeGrid';
import { WeekStrip } from '../components/WeekStrip';
import { FAB } from '../components/FAB';
import { AddEditEventModal } from '../modals/AddEditEventModal';
import { CalendarEvent, EventStatus, getKIContribution, eventHeight } from '../utils/eventUtils';
import { DragProvider, useDrag } from '../components/DragContext';
import { useEventStatuses } from '../hooks/useEventStatuses';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { isInCurrentWeek } from '../utils/dateUtils';
import { addMinutesToTimeString, formatTime, parseTimeString } from '../utils/dateUtils';

const SLOT_HEIGHT = 50;
const DRAG_SLOT_HEIGHT = SLOT_HEIGHT / 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const EDGE_ZONE = 60;

function CalendarContent() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>();
  const { getForDate, addEvent, updateEvent, deleteEvent, toggleComplete } = useCalendarEvents();
  const { settings } = useSettings();
  const { getStatus, setStatus } = useEventStatuses();
  const { adjustCount } = useWeeklyIndicators();
  const { active: dragActive, event: dragEvent, ghostX, ghostY, ghostWidth, ghostHeight, endDrag, startDrag, moveDrag } = useDrag();
  const frozenEventsRef = useRef<CalendarEvent[] | null>(null);
  const frozenDateRef = useRef<string | null>(null);
  const isAnimatingRef = useRef(false);
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

  if (dragActive && frozenEventsRef.current !== null && frozenDateRef.current !== dateStr) {
    const dragged = dragEvent
      ? frozenEventsRef.current.find(e => e.id === dragEvent.id) ?? null
      : null;
    const base = events.filter(e => e.id !== dragEvent?.id);
    frozenEventsRef.current = dragged ? [...base, dragged] : base;
    frozenDateRef.current = dateStr;
  }

  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const [currentScrollY, setCurrentScrollY] = useState(0);
  const [committedDate, setCommittedDate] = useState(new Date());
  const pendingResetRef = useRef(false);

  useEffect(() => {
    setCommittedDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!showMonthPicker) setPickerMonth(selectedDate);
  }, [selectedDate]);

  useLayoutEffect(() => {
    if (pendingResetRef.current) {
      pendingResetRef.current = false;
      translateX.setValue(-SCREEN_WIDTH);
    }
  }, [selectedDate]);

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

  function handleDragStart(event: CalendarEvent, x: number, y: number, width: number, height: number) {
    frozenEventsRef.current = events;
    frozenDateRef.current = dateStr;
    startDrag(event, x, y, width, height);
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
    const relativeY = absoluteY - SLOT_HEIGHT - gridTopY + scrollOffset;
    const fifteenMinSlot = Math.max(0, Math.floor(relativeY / DRAG_SLOT_HEIGHT));
    const hour = Math.floor(fifteenMinSlot / 4) + settings.gridStartHour;
    const minute = (fifteenMinSlot % 4) * 15;
    const newStart = formatTime(Math.min(hour, 23), minute);
    const { hour: sh, minute: sm } = parseTimeString(dragEvent.startTime);
    const { hour: eh, minute: em } = parseTimeString(dragEvent.endTime);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const durationMins = Math.max(endMins > startMins ? endMins - startMins : endMins + 1440 - startMins, 15);
    const newEnd = addMinutesToTimeString(newStart, durationMins);
    updateEvent(dragEvent.id, { startTime: newStart, endTime: newEnd, date: dateStr });
    endDrag();
  }

  function handleSwipeProgress(x: number) {
    if (isAnimatingRef.current) return;
    translateX.setValue(-SCREEN_WIDTH + x);
  }

  function handleSwipeCancel() {
    if (isAnimatingRef.current) return;
    Animated.spring(translateX, {
      toValue: -SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 180,
      friction: 24,
    }).start();
  }

  function handleSwipeDay(dir: 1 | -1) {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setCommittedDate(d => addDays(d, dir));
    const target = dir === 1 ? -SCREEN_WIDTH * 2 : 0;
    Animated.spring(translateX, {
      toValue: target,
      useNativeDriver: true,
      tension: 180,
      friction: 24,
    }).start(() => {
      isAnimatingRef.current = false;
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

      <WeekStrip
        selectedDate={committedDate}
        weekStart={settings.weekStart}
        onSelectDate={setSelectedDate}
        onSwipeWeek={handleSwipeWeek}
      />

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
              dragEventHeight={dragActive && dragEvent ? Math.max(eventHeight(dragEvent.startTime, dragEvent.endTime) - 1, 24) : undefined}
              initialScrollY={currentScrollY}
              restoreKey={dateStr}
              onScrollChange={setCurrentScrollY}
              gridStartHour={settings.gridStartHour}
              gridEndHour={settings.gridEndHour}
              isToday={isToday}
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

      {dragActive && dragEvent && (
        <View
          style={[styles.ghostOverlay, { left: ghostX - ghostWidth * 0.25, top: ghostY, width: ghostWidth }]}
          pointerEvents="none"
        >
          <View style={[styles.ghostBlock, { backgroundColor: Colors.card, borderLeftColor: dragEvent.color, height: ghostHeight }]}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dragEvent.color + '35' }]} />
            <Text style={[styles.ghostTitle, { color: Colors.text }]} numberOfLines={1}>{dragEvent.title}</Text>
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

      <FAB onPress={handleAddEvent} />

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
      backgroundColor: C.primary,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerDate: {
      fontSize: 22,
      fontWeight: '700',
      color: C.white,
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
      color: C.white,
      fontWeight: '700',
    },
    gridContainer: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: C.card,
    },
    gridRow: {
      flex: 1,
      flexDirection: 'row',
      width: SCREEN_WIDTH * 3,
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
