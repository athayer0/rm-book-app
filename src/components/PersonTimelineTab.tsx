import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useEventReport } from '../hooks/useEventReport';
import { CalendarEvent, getEventsForDate } from '../utils/eventUtils';
import { EventSizes, resolveEventSize } from '../constants/eventSizes';
import { EventBlock } from './EventBlock';
import { AddEditEventModal } from '../modals/AddEditEventModal';

/**
 * How far the timeline reaches, in days either side of today.
 *
 * Bounded because a recurring series with no end date expands one occurrence per
 * day forever — the same reason the unreported sweep is bounded, and the same
 * shape of answer. A year of history is more than the app has ever held; the
 * forward window is short because it is showing what's booked, not forecasting.
 */
const HISTORY_DAYS = 365;
const UPCOMING_DAYS = 60;

interface Props {
  personId: string;
}

/** "Today" and "Yesterday" beat a date for the two days carrying most of the traffic. */
function dayLabel(dateStr: string, today: Date): string {
  if (dateStr === format(today, 'yyyy-MM-dd')) return 'Today';
  if (dateStr === format(subDays(today, 1), 'yyyy-MM-dd')) return 'Yesterday';
  if (dateStr === format(addDays(today, 1), 'yyyy-MM-dd')) return 'Tomorrow';
  return format(parseISO(dateStr), 'EEEE, MMM d, yyyy');
}

/**
 * Everything this person is on, newest first.
 *
 * Walks a day at a time because getEventsForDate is the only recurrence expander
 * — it answers "what falls on this date", so there is no bulk form to call. The
 * walk runs downward from the far edge of the forward window, which is what
 * makes the result reverse-chronological without a second sort.
 *
 * Upcoming events are included rather than cut at today: an event booked with
 * someone is part of where you stand with them, and hiding it until it happens
 * would make the timeline disagree with the calendar.
 */
export function PersonTimelineTab({ personId }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
  const { events, updateEvent, deleteOccurrence, deleteFromDate } = useCalendarEvents();
  const { getStatus, report } = useEventReport();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  // The calendar's own density, so a block here is the same size as the one it
  // stands for rather than an approximation of it.
  const { slotHeight, fontSize } = EventSizes[resolveEventSize(settings.eventSize)];

  const groups = useMemo(() => {
    const today = new Date();
    const found: { dateStr: string; occurrences: CalendarEvent[] }[] = [];

    for (let offset = UPCOMING_DAYS; offset >= -HISTORY_DAYS; offset--) {
      const dateStr = format(addDays(today, offset), 'yyyy-MM-dd');
      const onThisDay = getEventsForDate(events, dateStr)
        .filter(occurrence => occurrence.people?.includes(personId));
      if (onThisDay.length === 0) continue;
      // getEventsForDate hands back ascending start times; a day inside a
      // newest-first list reads the same way round as the list itself.
      found.push({ dateStr, occurrences: onThisDay.reverse() });
    }

    return found;
  }, [events, personId]);

  const total = groups.reduce((sum, group) => sum + group.occurrences.length, 0);
  const today = new Date();

  async function handleSave(eventData: Omit<CalendarEvent, 'id'>) {
    if (editing) await updateEvent(editing.id, eventData);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {total === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyText}>
              Events show up here once you add this person to one.
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.dateStr} style={styles.group}>
              <Text style={styles.groupHeader}>{dayLabel(group.dateStr, today)}</Text>

              {group.occurrences.map(occurrence => (
                <View key={`${occurrence.id}::${occurrence.date}`} style={styles.blockRow}>
                  <EventBlock
                    inline
                    event={occurrence}
                    status={getStatus(occurrence.id, occurrence.date)}
                    onPress={() => setEditing(occurrence)}
                    // A checkbox event's tick target would otherwise swallow the
                    // press and do nothing, leaving a dead patch on the block.
                    onToggleStatus={() => setEditing(occurrence)}
                    slotHeight={slotHeight}
                    fontSize={fontSize}
                  />
                </View>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <AddEditEventModal
        visible={editing !== null}
        event={editing}
        settings={settings}
        currentStatus={editing ? getStatus(editing.id, editing.date) : undefined}
        onStatusChange={editing ? (s) => report(editing, s) : undefined}
        onSave={handleSave}
        onDelete={(id, occurrenceDate, mode) =>
          mode === 'future' ? deleteFromDate(id, occurrenceDate) : deleteOccurrence(id, occurrenceDate)
        }
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { paddingTop: 12 },
    group: { marginBottom: 16 },
    groupHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    blockRow: {
      marginHorizontal: 16,
      marginBottom: 8,
    },
    empty: {
      alignItems: 'center',
      paddingTop: 64,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: C.text,
      marginTop: 12,
    },
    emptyText: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 6,
    },
  });
}
