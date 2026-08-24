import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { dateFnsLocale, datePattern } from '../utils/dateFnsLocale';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useUnreported } from '../hooks/useUnreported';
import { EventSizes, resolveEventSize } from '../constants/eventSizes';
import { CalendarEvent } from '../utils/eventUtils';
import { SheetModal } from '../components/SheetModal';
import { EventBlock } from '../components/EventBlock';
import { AddEditEventModal } from './AddEditEventModal';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** "Today" and "Yesterday" beat a date for the two days carrying most of the backlog. */
function dayLabel(dateStr: string, today: Date, t: TFunction, language: 'en' | 'es'): string {
  if (dateStr === format(today, 'yyyy-MM-dd')) return t('personTimeline.today');
  if (dateStr === format(subDays(today, 1), 'yyyy-MM-dd')) return t('personTimeline.yesterday');
  return format(parseISO(dateStr), datePattern('weekdayMonthDay', language), { locale: dateFnsLocale(language) });
}

export function UnreportedEventsModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { unreported, report, statusOf } = useUnreported();
  const { updateEvent, updateOccurrence, updateFromDate, deleteOccurrence, deleteFromDate } = useCalendarEvents();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
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

  async function handleSave(eventData: Omit<CalendarEvent, 'id'>, scope?: 'single' | 'future') {
    if (!editing) return;
    if (scope === 'single') await updateOccurrence(editing.id, editing.date, eventData);
    else if (scope === 'future') await updateFromDate(editing.id, editing.date, eventData);
    else await updateEvent(editing.id, eventData);
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12 }}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>{t('unreportedEvents.title')}</Text>
          <Text style={styles.headerCount}>
            {unreported.length === 0
              ? t('unreportedEvents.allCaughtUp')
              : t('unreportedEvents.waiting', { count: unreported.length })}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
        {unreported.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.statusCompleted} />
            <Text style={styles.emptyText}>{t('unreportedEvents.nothingToReport')}</Text>
            <Text style={styles.emptyHint}>
              {t('unreportedEvents.emptyHint')}
            </Text>
          </View>
        ) : (
          groups.map(([dateStr, occurrences]) => (
            <View key={dateStr} style={styles.group}>
              <Text style={styles.groupHeader}>{dayLabel(dateStr, today, t, settings.language)}</Text>

              {occurrences.map(occurrence => (
                <View key={`${occurrence.id}::${occurrence.date}`} style={styles.blockRow}>
                  <EventBlock
                    inline
                    event={occurrence}
                    status={statusOf(occurrence.id, occurrence.date)}
                    onPress={() => setEditing(occurrence)}
                    // The tick target is a task's own checkbox — tapping it reports
                    // the occurrence directly, the same as the calendar's checkbox,
                    // rather than opening the editor the rest of the block does.
                    onToggleStatus={() => report(occurrence, 'completed')}
                    slotHeight={slotHeight}
                    fontSize={fontSize}
                  />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/*
        Nested inside this sheet rather than sitting beside it in HomeScreen. Two
        Modals as siblings both race to present from the same view controller; a
        Modal declared within another's content presents from that one, which is
        what makes them stack. It also makes "closing the editor returns to the
        backlog" structural — this sheet is still open behind it, not merely
        re-shown in the right order.
      */}
      <AddEditEventModal
        visible={editing !== null}
        event={editing}
        settings={settings}
        currentStatus={editing ? statusOf(editing.id, editing.date) : undefined}
        onStatusChange={editing ? (s) => report(editing, s) : undefined}
        onSave={handleSave}
        onDelete={(id, occurrenceDate, mode) =>
          mode === 'future' ? deleteFromDate(id, occurrenceDate) : deleteOccurrence(id, occurrenceDate)
        }
        onClose={() => setEditing(null)}
      />
    </SheetModal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    closeBtn: {
      width: 48,
      alignItems: 'flex-start',
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
