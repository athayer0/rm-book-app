import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays } from 'date-fns';
import { Colors } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { TimeGrid } from '../components/TimeGrid';
import { WeekStrip } from '../components/WeekStrip';
import { FAB } from '../components/FAB';
import { AddEditEventModal } from '../modals/AddEditEventModal';
import { CalendarEvent } from '../utils/eventUtils';

export function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const { getForDate, addEvent, updateEvent, deleteEvent } = useCalendarEvents();

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const events = getForDate(dateStr);

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);
  const prevDay = useCallback(() => setSelectedDate(d => subDays(d, 1)), []);
  const nextDay = useCallback(() => setSelectedDate(d => addDays(d, 1)), []);

  function handleEventPress(event: CalendarEvent) {
    setEditingEvent(event);
    setShowEventModal(true);
  }

  function handleAddEvent() {
    setEditingEvent(null);
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

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{format(selectedDate, 'MMM d')}</Text>
          <Text style={styles.headerYear}>{format(selectedDate, 'yyyy')}</Text>
        </View>
        <View style={styles.headerActions}>
          {!isToday && (
            <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
              <Text style={styles.todayText}>Today</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={prevDay} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={nextDay} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Week strip */}
      <WeekStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Day label */}
      <View style={styles.dayLabelRow}>
        <Text style={styles.dayLabel}>{format(selectedDate, 'EEEE, MMMM d')}</Text>
        <Text style={styles.eventCount}>{events.length} event{events.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Time grid */}
      <TimeGrid events={events} onEventPress={handleEventPress} />

      {/* FAB */}
      <FAB onPress={handleAddEvent} />

      {/* Event modal */}
      <AddEditEventModal
        visible={showEventModal}
        event={editingEvent}
        defaultDate={dateStr}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        onClose={() => setShowEventModal(false)}
      />
    </SafeAreaView>
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
    alignItems: 'baseline',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    marginRight: 4,
  },
  todayText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '500',
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
});
