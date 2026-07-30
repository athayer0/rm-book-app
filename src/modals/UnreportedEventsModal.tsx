import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { EventSizes, resolveEventSize } from '../constants/eventSizes';
import { CalendarEvent, EventStatus } from '../utils/eventUtils';
import { SheetModal } from '../components/SheetModal';
import { EventBlock } from '../components/EventBlock';

interface Props {
  visible: boolean;
  onClose: () => void;
  unreported: CalendarEvent[];
  /** The recorded status; EventBlock resolves it into the badge it draws. */
  statusOf: (eventId: string, dateStr: string) => EventStatus | undefined;
  onPressEvent: (occurrence: CalendarEvent) => void;
}

/** "Today" and "Yesterday" beat a date for the two days carrying most of the backlog. */
function dayLabel(dateStr: string, today: Date): string {
  if (dateStr === format(today, 'yyyy-MM-dd')) return 'Today';
  if (dateStr === format(subDays(today, 1), 'yyyy-MM-dd')) return 'Yesterday';
  return format(parseISO(dateStr), 'EEEE, MMM d');
}

export function UnreportedEventsModal({ visible, onClose, unreported, statusOf, onPressEvent }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
  const today = new Date();

  // The calendar's own density, so a block here is the same size as the one it
  // stands for rather than an approximation of it.
  const { slotHeight, fontSize } = EventSizes[resolveEventSize(settings.eventSize)];

  // findUnreportedOccurrences walks the most recent day first, so insertion order
  // is already newest-first and a Map preserves it.
  const groups = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const occurrence of unreported) {
      const bucket = byDate.get(occurrence.date);
      if (bucket) bucket.push(occurrence);
      else byDate.set(occurrence.date, [occurrence]);
    }
    return [...byDate.entries()];
  }, [unreported]);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>Unreported Events</Text>
          <Text style={styles.headerCount}>
            {unreported.length === 0
              ? 'All caught up'
              : `${unreported.length} waiting · last 30 days`}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {unreported.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.statusCompleted} />
            <Text style={styles.emptyText}>Nothing to report</Text>
            <Text style={styles.emptyHint}>
              Events show up here once their start time has passed.
            </Text>
          </View>
        ) : (
          groups.map(([dateStr, occurrences]) => (
            <View key={dateStr} style={styles.group}>
              <Text style={styles.groupHeader}>{dayLabel(dateStr, today)}</Text>

              {occurrences.map(occurrence => (
                <View key={`${occurrence.id}::${occurrence.date}`} style={styles.blockRow}>
                  <EventBlock
                    inline
                    event={occurrence}
                    status={statusOf(occurrence.id, occurrence.date)}
                    onPress={() => onPressEvent(occurrence)}
                    // A checkbox event's tick target would otherwise swallow the
                    // press and do nothing, leaving a dead patch on the block.
                    onToggleStatus={() => onPressEvent(occurrence)}
                    slotHeight={slotHeight}
                    fontSize={fontSize}
                  />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SheetModal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerLabels: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    headerCount: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 12,
      paddingBottom: 32,
    },
    group: {
      marginBottom: 16,
    },
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
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: C.text,
      marginTop: 12,
    },
    emptyHint: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 6,
    },
  });
}
