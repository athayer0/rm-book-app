import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions,
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
import { CalendarEvent } from '../utils/eventUtils';
import { DragProvider, useDrag } from '../components/DragContext';
import { addMinutesToTimeString, formatTime } from '../utils/dateUtils';
import { EventTypeConfig } from '../constants/colors';

const SLOT_HEIGHT = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;
const EDGE_ZONE = 70;

function CalendarContent() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>();
  const { getForDate, addEvent, updateEvent, deleteEvent, toggleComplete } = useCalendarEvents();
  const { settings } = useSettings();
  const { active: dragActive, event: dragEvent, ghostX, ghostY, endDrag, startDrag, moveDrag } = useDrag();

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const events = getForDate(dateStr);
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);
  const edgeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edge-scroll while dragging
  useEffect(() => {
    if (!dragActive) {
      if (edgeIntervalRef.current) {
        clearInterval(edgeIntervalRef.current);
        edgeIntervalRef.current = null;
      }
      return;
    }

    const isLeftEdge = ghostX < EDGE_ZONE;
    const isRightEdge = ghostX > SCREEN_WIDTH - EDGE_ZONE;

    if ((isLeftEdge || isRightEdge) && !edgeIntervalRef.current) {
      edgeIntervalRef.current = setInterval(() => {
        setSelectedDate(d => isLeftEdge ? addDays(d, -1) : addDays(d, 1));
      }, 1000);
    } else if (!isLeftEdge && !isRightEdge && edgeIntervalRef.current) {
      clearInterval(edgeIntervalRef.current);
      edgeIntervalRef.current = null;
    }

    return () => {
      if (edgeIntervalRef.current) {
        clearInterval(edgeIntervalRef.current);
        edgeIntervalRef.current = null;
      }
    };
  }, [dragActive, ghostX]);

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

  async function handleSaveEvent(eventData: Omit<CalendarEvent, 'id'>) {
    if (editingEvent) {
      await updateEvent(editingEvent.id, eventData);
    } else {
      await addEvent(eventData);
    }
  }

  async function handleDeleteEvent(id: string) {
    await deleteEvent(id);
  }

  function handleDragStart(event: CalendarEvent, x: number, y: number) {
    startDrag(event, x, y);
  }

  function handleDragMove(x: number, y: number) {
    moveDrag(x, y);
  }

  function handleDragDrop(absoluteY: number, gridTopY: number, scrollOffset: number) {
    if (!dragEvent) { endDrag(); return; }
    const relativeY = absoluteY - gridTopY + scrollOffset;
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
    if (!dragEvent) { endDrag(); return; }
    updateEvent(dragEvent.id, { date: format(date, 'yyyy-MM-dd') });
    endDrag();
  }

  function handleSwipeDay(dir: 1 | -1) {
    setSelectedDate(d => addDays(d, dir));
  }

  function handleSwipeWeek(dir: 1 | -1) {
    setSelectedDate(d => addDays(d, dir * 7));
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{format(selectedDate, 'MMM d')}</Text>
          <Text style={styles.headerYear}>{format(selectedDate, 'yyyy')}</Text>
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

      {/* Day label */}
      <View style={styles.dayLabelRow}>
        <Text style={styles.dayLabel}>{format(selectedDate, 'EEEE, MMMM d')}</Text>
        <Text style={styles.eventCount}>{events.length} event{events.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Time grid */}
      <TimeGrid
        events={events}
        onEventPress={handleEventPress}
        onToggleComplete={toggleComplete}
        onTapEmpty={handleTapEmpty}
        onSwipeDay={handleSwipeDay}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragDrop}
        dragHoverY={dragActive ? ghostY : null}
        gridStartHour={settings.gridStartHour}
        gridEndHour={settings.gridEndHour}
      />

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

      {/* FAB */}
      <FAB onPress={handleAddEvent} />

      {/* Event modal */}
      <AddEditEventModal
        visible={showEventModal}
        event={editingEvent}
        defaultDate={dateStr}
        defaultStartTime={defaultStartTime}
        settings={settings}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
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
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  eventCount: {
    fontSize: 12,
    color: Colors.textLight,
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
