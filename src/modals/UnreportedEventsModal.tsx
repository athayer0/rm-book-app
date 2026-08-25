import React, { useEffect, useMemo, useState } from 'react';
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
import { CalendarEvent, EventStatus } from '../utils/eventUtils';
import { SheetModal } from '../components/SheetModal';
import { EventBlock } from '../components/EventBlock';
import { AddEditEventModal } from './AddEditEventModal';
import { DropdownMenu, DropdownItem } from '../components/DropdownMenu';
import { StatusGlyph, statusLabel } from '../components/StatusPicker';

/** Worst to best — the same order StatusPicker's own row uses. */
const BULK_STATUS_OPTIONS: EventStatus[] = ['failed', 'pending', 'completed'];

/** Matches the occurrence keying every row already uses. */
function occurrenceKey(occurrence: CalendarEvent): string {
  return `${occurrence.id}::${occurrence.date}`;
}

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
  // Bulk reporting: tap Select, tap rows to pick them, then a status icon in the
  // header reports every row picked at once — the same Select → pick → apply
  // shape PeopleScreen uses for bulk status.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showBulkStatusMenu, setShowBulkStatusMenu] = useState(false);
  const today = new Date();

  // The modal's own React state outlives a close — SheetModal keeps this
  // component mounted through its close animation rather than tearing it down —
  // so select mode has to be dropped explicitly, or it would still be on next
  // time the sheet opens.
  useEffect(() => {
    if (!visible) exitSelectMode();
  }, [visible]);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedKeys(new Set());
    setShowBulkStatusMenu(false);
  }

  function toggleSelected(key: string) {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function applyBulkStatus(status: EventStatus) {
    const targets = unreported.filter(o => selectedKeys.has(occurrenceKey(o)));
    for (const occurrence of targets) await report(occurrence, status);
    exitSelectMode();
  }

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
            {selectMode
              ? t('unreportedEvents.selectedCount', { count: selectedKeys.size })
              : unreported.length === 0
              ? t('unreportedEvents.allCaughtUp')
              : t('unreportedEvents.waiting', { count: unreported.length })}
          </Text>
        </View>

        {unreported.length > 0 && (
          <View style={styles.headerActions}>
            {/* Mirrors PeopleScreen's Set Type: text rather than an icon, greyed
                out until a row is picked rather than hidden, so the row this
                whole flow ends at doesn't shift width as the selection changes.
                Darkens (textLight → textSecondary) once something's picked,
                short of the checkbox's own full-black text token. */}
            {selectMode && (
              <TouchableOpacity
                style={styles.headerTextAction}
                onPress={() => setShowBulkStatusMenu(v => !v)}
                disabled={selectedKeys.size === 0}
                activeOpacity={0.7}
              >
                <Text style={[styles.headerActionText, selectedKeys.size === 0 && styles.headerActionTextDisabled]}>
                  {t('unreportedEvents.setStatus')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.selectChip}
              onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={selectMode ? t('unreportedEvents.exitSelectMode') : t('unreportedEvents.selectEvents')}
            >
              <Ionicons name={selectMode ? 'checkbox' : 'checkbox-outline'} size={24} color={Colors.text} />
            </TouchableOpacity>

            {/* Rendered unconditionally, like every other DropdownMenu in the
                app: it unmounts itself once its own exit animation finishes,
                and gating it on showBulkStatusMenu would cut that off. */}
            <DropdownMenu open={showBulkStatusMenu} align="right" style={styles.statusDropdown}>
              {BULK_STATUS_OPTIONS.map((status, i) => (
                <DropdownItem
                  key={status}
                  label={statusLabel(status, t)}
                  showSeparator={i < BULK_STATUS_OPTIONS.length - 1}
                  leading={<View style={styles.menuIcon}><StatusGlyph status={status} size={18} /></View>}
                  onPress={() => { setShowBulkStatusMenu(false); applyBulkStatus(status); }}
                />
              ))}
            </DropdownMenu>
          </View>
        )}
      </View>

      {showBulkStatusMenu && (
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setShowBulkStatusMenu(false)}
        />
      )}

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

              {occurrences.map(occurrence => {
                const key = occurrenceKey(occurrence);
                return (
                  <View key={key} style={styles.blockRow}>
                    <EventBlock
                      inline
                      event={occurrence}
                      status={statusOf(occurrence.id, occurrence.date)}
                      onPress={() => (selectMode ? toggleSelected(key) : setEditing(occurrence))}
                      // The tick target is a task's own checkbox — tapping it reports
                      // the occurrence directly, the same as the calendar's checkbox,
                      // rather than opening the editor the rest of the block does.
                      // Select mode takes the badge over for the selection checkbox
                      // instead, so this never fires alongside it.
                      onToggleStatus={() => report(occurrence, 'completed')}
                      slotHeight={slotHeight}
                      fontSize={fontSize}
                      selected={selectMode ? selectedKeys.has(key) : undefined}
                    />
                  </View>
                );
              })}
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
      // Lifted above the ScrollView below it, so the bulk-status dropdown (which
      // hangs off this row) draws on top of the list rather than under it.
      zIndex: 20,
      elevation: 20,
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    selectChip: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Sized to fit inside the chip row alongside it, so entering select mode
    // doesn't change the header's own height.
    headerTextAction: { height: 34, justifyContent: 'center', paddingHorizontal: 4 },
    headerActionText: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
    headerActionTextDisabled: { color: C.textLight },
    statusDropdown: {
      // 28, not the 34 the chip stands: DropdownMenu adds a 6px marginTop of its
      // own, so the menu still lands right under the row (see PeopleScreen's
      // filterDropdown for the same arithmetic).
      top: 28,
      minWidth: 170,
    },
    menuIcon: {
      marginRight: 6,
    },
    menuBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
      elevation: 10,
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
