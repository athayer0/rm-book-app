import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { EventSizes, resolveEventSize, EVENT_BLOCK_STYLE } from '../constants/eventSizes';
import { CalendarEvent, EventStatus, isCheckboxType, renderedEventHeight } from '../utils/eventUtils';
import { SheetModal } from '../components/SheetModal';
import { StatusPicker } from '../components/StatusPicker';

interface Props {
  visible: boolean;
  onClose: () => void;
  unreported: CalendarEvent[];
  onReport: (occurrence: CalendarEvent, status: EventStatus) => Promise<void>;
}

/** "Today" and "Yesterday" beat a date for the two days carrying most of the backlog. */
function dayLabel(dateStr: string, today: Date): string {
  if (dateStr === format(today, 'yyyy-MM-dd')) return 'Today';
  if (dateStr === format(subDays(today, 1), 'yyyy-MM-dd')) return 'Yesterday';
  return format(parseISO(dateStr), 'EEEE, MMM d');
}

export function UnreportedEventsModal({ visible, onClose, unreported, onReport }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();
  const today = new Date();

  // Blocks track the calendar's density setting, so an event is the same size in
  // both places rather than merely the same shape.
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

              {occurrences.map(occurrence => {
                const isCheckbox = isCheckboxType(occurrence.type);
                return (
                  <View key={`${occurrence.id}::${occurrence.date}`} style={styles.row}>
                    <View
                      style={[
                        styles.block,
                        {
                          height: renderedEventHeight(occurrence, slotHeight),
                          borderLeftColor: occurrence.color,
                          // Mirrors EventBlock: the tightest densities lose their
                          // vertical padding so the title still fits.
                          paddingVertical: slotHeight <= 40 || isCheckbox ? 1 : 3,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.blockTint,
                          { backgroundColor: occurrence.color + EVENT_BLOCK_STYLE.tintAlpha },
                        ]}
                      />
                      <View style={styles.blockRow}>
                        <Text style={[styles.blockTitle, { fontSize }]} numberOfLines={1}>
                          {occurrence.title}
                        </Text>
                        <Text style={[styles.blockTime, { fontSize }]} numberOfLines={1}>
                          {/* Checkbox types store no duration — start and end are equal. */}
                          {isCheckbox
                            ? occurrence.startTime
                            : `${occurrence.startTime} – ${occurrence.endTime}`}
                        </Text>
                      </View>
                    </View>

                    <StatusPicker
                      value={undefined}
                      onChange={status => { if (status) onReport(occurrence, status); }}
                      size={30}
                    />
                  </View>
                );
              })}
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    // The calendar block's look without its grid geometry: EventBlock is absolutely
    // positioned into the time grid and carries drag gestures, so the shared part
    // is the visual signature in EVENT_BLOCK_STYLE rather than the component.
    block: {
      flex: 1,
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: C.card,
      borderRadius: EVENT_BLOCK_STYLE.borderRadius,
      borderLeftWidth: EVENT_BLOCK_STYLE.accentWidth,
      paddingLeft: EVENT_BLOCK_STYLE.paddingLeft,
      paddingRight: EVENT_BLOCK_STYLE.paddingRight,
    },
    blockTint: {
      ...StyleSheet.absoluteFillObject,
    },
    blockRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    blockTitle: {
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    blockTime: {
      color: C.textSecondary,
      marginLeft: 4,
      flexShrink: 0,
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
