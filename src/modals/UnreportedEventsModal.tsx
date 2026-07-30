import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, subDays } from 'date-fns';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels } from '../constants/colors';
import { CalendarEvent, EventStatus, isCheckboxType } from '../utils/eventUtils';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  unreported: CalendarEvent[];
  onReport: (occurrence: CalendarEvent, status: EventStatus) => Promise<void>;
  onReportAll: (status: EventStatus) => Promise<number>;
}

/** "Today" and "Yesterday" beat a date for the two days that carry most of the backlog. */
function dayLabel(dateStr: string, today: Date): string {
  if (dateStr === format(today, 'yyyy-MM-dd')) return 'Today';
  if (dateStr === format(subDays(today, 1), 'yyyy-MM-dd')) return 'Yesterday';
  return format(parseISO(dateStr), 'EEEE, MMM d');
}

export function UnreportedEventsModal({
  visible, onClose, unreported, onReport, onReportAll,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const today = new Date();

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

  function confirmReportAll() {
    const total = unreported.length;
    Alert.alert(
      `Report ${total} event${total === 1 ? '' : 's'}?`,
      'Each one is marked completed and counted toward the goals for the week it happened in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark all completed', onPress: () => { onReportAll('completed'); } },
      ],
    );
  }

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

      {unreported.length > 0 && (
        <TouchableOpacity style={styles.bulkBtn} onPress={confirmReportAll} activeOpacity={0.85}>
          <Ionicons name="checkmark-done" size={18} color={Colors.white} />
          <Text style={styles.bulkBtnText}>MARK ALL COMPLETED</Text>
        </TouchableOpacity>
      )}

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
                <View
                  key={`${occurrence.id}::${occurrence.date}`}
                  style={[styles.row, { borderLeftColor: EventColors[occurrence.type] ?? Colors.border }]}
                >
                  <View style={styles.rowLabels}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{occurrence.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {/* Checkbox types store no duration — start and end are equal. */}
                      {isCheckboxType(occurrence.type)
                        ? occurrence.startTime
                        : `${occurrence.startTime} – ${occurrence.endTime}`}
                      {'  ·  '}
                      {EventTypeLabels[occurrence.type] ?? occurrence.type}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.action, { borderColor: Colors.statusFailed }]}
                    onPress={() => onReport(occurrence, 'failed')}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={20} color={Colors.statusFailed} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.action, { borderColor: Colors.statusCompleted, backgroundColor: Colors.statusCompleted }]}
                    onPress={() => onReport(occurrence, 'completed')}
                    hitSlop={6}
                  >
                    <Ionicons name="checkmark" size={20} color={Colors.white} />
                  </TouchableOpacity>
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
    bulkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      marginBottom: 4,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: C.statusCompleted,
    },
    bulkBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: C.white,
      letterSpacing: 1.1,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 8,
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
      marginBottom: 6,
      paddingLeft: 10,
      paddingRight: 10,
      paddingVertical: 10,
      borderRadius: 8,
      borderLeftWidth: 3,
      backgroundColor: C.background,
    },
    rowLabels: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: C.text,
    },
    rowMeta: {
      fontSize: 11,
      color: C.textSecondary,
      marginTop: 2,
    },
    action: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
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
