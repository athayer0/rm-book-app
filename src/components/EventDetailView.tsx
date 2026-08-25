import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors } from '../constants/colors';
import {
  CalendarEvent, EventStatus, isReportableType, isCheckboxType, hasEndTime,
} from '../utils/eventUtils';
import {
  CONTACT_METHODS, contactMethodLabel, methodFieldLabel, resolveContactMethod, usesContactMethod,
} from '../constants/contactMethods';
import { GoalIcon } from './GoalIcon';
import { StatusCheckbox } from './StatusCheckbox';
import { StatusIcon } from './StatusIcon';
import { StatusGlyph, statusLabel } from './StatusPicker';
import { PERSON_STATUSES, StatusConfig } from '../constants/personStatuses';
import { usePeople, Person } from '../hooks/usePeople';
import { AppSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';
import { dateFnsLocale, datePattern } from '../utils/dateFnsLocale';
import { displayTime } from '../utils/dateUtils';

interface Props {
  /**
   * What to show. Built from the editor's own form state rather than taken from
   * the caller's copy of the event, so returning here after Save reads back the
   * values just written — the screens hold a snapshot that doesn't refresh.
   */
  event: CalendarEvent;
  settings: AppSettings;
  status: EventStatus | undefined;
  /**
   * Checkbox-style events (task) can still be checked off straight from here —
   * it's a single tap toggling one thing, not a choice among three. The
   * tri-state picker stays edit-only; this is never used for that case. Absent
   * makes the checkbox display-only too.
   */
  onStatusChange?: (status: EventStatus | undefined) => void;
  /** Absent hides the trash icon — the caller owns confirmation and the actual delete. */
  onDelete?: () => void;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function longDate(dateStr: string, language: 'en' | 'es'): string {
  return format(new Date(dateStr + 'T12:00:00'), datePattern('weekdayMonthDayYear', language), { locale: dateFnsLocale(language) });
}

function shortDate(dateStr: string, language: 'en' | 'es'): string {
  return format(new Date(dateStr + 'T12:00:00'), datePattern('monthDayYear', language), { locale: dateFnsLocale(language) });
}

// The edit form's own checkbox size — kept here too since it's still a real
// tap target for a checkbox-style event, not shrunk down for being read-only.
const EDITOR_CHECKBOX_SIZE = 38;

/** "Every week on Mon, Wed" — the series in one line, without its end date. */
function recurrenceSummary(event: CalendarEvent, t: TFunction): string {
  if (event.recurringRule === 'daily') return t('eventDetail.everyDay');
  if (event.recurringRule === 'monthly') return t('eventDetail.everyMonth');
  // Weekly, including a series saved before per-day selection existed: those
  // repeat on the start date's own weekday.
  const days = event.recurringDays?.length
    ? event.recurringDays
    : [new Date(event.date + 'T12:00:00').getDay()];
  const names = [...days].sort((a, b) => a - b).map(d => t(`calendar.weekdayAbbrev.${WEEKDAY_KEYS[d]}`));
  return t('eventDetail.everyWeekOn', { days: names.join(', ') });
}

/**
 * An event as it stands, with nothing offering to be typed in.
 *
 * The same uppercase labels as the editor, minus every affordance: no underlines
 * beneath values, no chevrons, no remove buttons. Unlike the editor, which gives
 * each field a card of its own, everything here — including the title — shares
 * one card and is separated by rules, reading as a page about the event rather
 * than a stack of things to fill in.
 *
 * A quantity-type event's count is read-only here — setting one happens on the
 * edit form now, which is the only place it's written. Status is read-only for
 * the tri-state (pending/completed/failed) types for the same reason, but a
 * checkbox-style event can still be checked off from here, same as always —
 * see onStatusChange.
 *
 * Empty fields are dropped rather than shown blank, so what's here is what the
 * event actually has.
 */
export function EventDetailView({
  event, settings, status, onStatusChange, onDelete,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { people: allPeople } = usePeople();
  const { byId: eventTypeById } = useEventTypeDefinitions();

  const peopleById = useMemo(
    () => new Map(allPeople.map(p => [p.id, p])),
    [allPeople],
  );

  // Same fallback as the editor's: PERSON_STATUSES is a Record, so indexing it
  // is typed as always finding something, but a status this build no longer
  // defines — or an id with no person behind it — lands here.
  function statusConfigOf(candidate: Person | undefined): StatusConfig {
    return PERSON_STATUSES[candidate?.status ?? ''] ?? { color: Colors.textLight, icon: 'ellipse', shape: 'dot' };
  }

  const color = settings.eventTypeColors[event.type] ?? EventColors[event.type] ?? Colors.control;
  const isBackup = event.backup === true;
  const attendees = event.people ?? [];
  const notes = event.notes?.trim() ?? '';
  const method = resolveContactMethod(event.contactMethod, event.type);

  /**
   * The card's contents, gathered rather than written inline so the rules
   * between them fall where they should. Which groups are present varies by
   * event, and a divider drawn by each group itself would land above the first
   * one or below the last as soon as a neighbour dropped out.
   */
  const groups: { key: string; node: React.ReactNode }[] = [];

  groups.push({
    key: 'name',
    node: (
      <>
        <Text style={styles.label}>{t('eventDetail.title')}</Text>
        <View style={styles.nameRow}>
          <Text style={[styles.value, styles.nameValue]}>{event.title}</Text>
          {isBackup && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('eventDetail.backup')}</Text>
            </View>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('eventDetail.deleteEvent')}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </>
    ),
  });

  const isStatusCheckbox = eventTypeById[event.type]?.reportStyle === 'checkbox';
  if (!isBackup && isReportableType(event.type, eventTypeById)) {
    groups.push({
      key: 'status',
      node: (
        <>
          <Text style={styles.label}>{t('eventDetail.status')}</Text>
          {/* Whichever one is currently set, not the other two — the tri-state
              picker's tappable list belongs to the editor. Both cases draw at
              the editor's own size and on the same side (right) it does. */}
          {isStatusCheckbox ? (
            <View style={styles.statusRow}>
              <Text style={styles.value}>
                {status === 'completed' ? t('eventStatus.completed') : t('eventDetail.notCompleted')}
              </Text>
              <TouchableOpacity
                onPress={() => onStatusChange?.(status === 'completed' ? undefined : 'completed')}
                disabled={!onStatusChange}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: status === 'completed' }}
              >
                <StatusCheckbox checked={status === 'completed'} size={EDITOR_CHECKBOX_SIZE} color={color} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Text style={styles.value}>{status ? statusLabel(status, t) : t('goals.none')}</Text>
              {/* StatusGlyph defaults to BASE_SIZE (54) — the same "big" size
                  StatusPicker draws each option at in the editor. */}
              {status && <StatusGlyph status={status} />}
            </View>
          )}
        </>
      ),
    });
  }

  if (!isBackup && eventTypeById[event.type]?.goalMode === 'quantity') {
    const quantity = event.quantity ?? 0;
    groups.push({
      key: 'quantity',
      node: (
        <>
          <Text style={styles.label}>{t('eventDetail.quantity')}</Text>
          {/* Units modify the number rather than getting a section of their
              own — "5 miles", not a separate Units row next to a bare "5" —
              at the editor's own smaller/lighter units weight so it still
              reads as a unit, not part of the count. */}
          <Text style={styles.quantityBox}>
            {quantity}
            {!!event.units && <Text style={styles.quantityUnits}> {event.units}</Text>}
          </Text>
        </>
      ),
    });
  }

  groups.push({
    key: 'type',
    node: (
      <>
        <Text style={styles.label}>{t('eventDetail.eventType')}</Text>
        <View style={styles.inlineValue}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <Text style={styles.value}>
            {eventTypeById[event.type] ? eventTypeDisplayLabel(eventTypeById[event.type], t) : event.type}
          </Text>
        </View>
      </>
    ),
  });

  if (usesContactMethod(event.type)) {
    groups.push({
      key: 'method',
      node: (
        <>
          <Text style={styles.label}>{methodFieldLabel(event.type, t)}</Text>
          <View style={styles.inlineValue}>
            <GoalIcon
              icon={CONTACT_METHODS[method].icon}
              iconFamily={CONTACT_METHODS[method].iconFamily}
              size={16}
              color={Colors.textSecondary}
            />
            <Text style={styles.value}>{contactMethodLabel(method, t)}</Text>
          </View>
        </>
      ),
    });
  }

  groups.push({
    key: 'when',
    node: (
      <>
        <Text style={styles.label}>{t('eventDetail.when')}</Text>
        {/*
          Date and time carry an icon each rather than stacking as two more lines
          of the same 16pt text: the group holds up to three facts about one
          moment, and undifferentiated lines run together. The recurrence drops
          out of the stack entirely and into a chip below — it describes the
          series rather than this occurrence, so it should not read as a third
          equal line.
        */}
        <View style={styles.whenRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} style={styles.whenIcon} />
          <Text style={styles.value}>{longDate(event.date, settings.language)}</Text>
        </View>
        <View style={[styles.whenRow, styles.whenRowSpaced]}>
          <Ionicons name="time-outline" size={16} color={Colors.textSecondary} style={styles.whenIcon} />
          <Text style={styles.value}>
            {isCheckboxType(event.type) || !hasEndTime(event)
              ? displayTime(event.startTime, settings.language, settings.timeFormat)
              : `${displayTime(event.startTime, settings.language, settings.timeFormat)} – ${displayTime(event.endTime, settings.language, settings.timeFormat)}`}
          </Text>
        </View>
        {event.recurring && (
          <View style={styles.repeatChip}>
            <Ionicons name="repeat" size={15} color={Colors.textSecondary} />
            {/* One chip, not two: the end date qualifies the rule, and a chip of
                its own would read as a second, unrelated fact. It takes a line of
                its own inside the chip so a long rule and its end date don't run
                together. */}
            <View style={styles.repeatTextBlock}>
              <Text style={styles.repeatText}>{recurrenceSummary(event, t)}</Text>
              {!!event.recurringUntil && (
                <Text style={[styles.repeatText, styles.repeatUntil]}>
                  {t('eventDetail.until', { date: shortDate(event.recurringUntil, settings.language) })}
                </Text>
              )}
            </View>
          </View>
        )}
      </>
    ),
  });

  if (attendees.length > 0) {
    groups.push({
      key: 'people',
      node: (
        <>
          <Text style={styles.label}>{t('eventDetail.people')}</Text>
          {attendees.map((id, i) => {
            const attendee = peopleById.get(id);
            return (
              <View key={id} style={[styles.personRow, i > 0 && styles.personRowDivided]}>
                <StatusIcon config={statusConfigOf(attendee)} size={18} style={styles.personIcon} />
                <Text style={styles.personName} numberOfLines={1}>
                  {attendee?.name ?? t('eventDetail.unknownPerson')}
                </Text>
              </View>
            );
          })}
        </>
      ),
    });
  }

  if (notes.length > 0) {
    groups.push({
      key: 'notes',
      node: (
        <>
          <Text style={styles.label}>{t('personFields.notes')}</Text>
          <Text style={styles.value}>{notes}</Text>
        </>
      ),
    });
  }

  return (
    <ScrollView style={styles.scroll} bounces={false} overScrollMode="never">
      <View style={styles.cardShadow}>
      <View style={styles.card}>
        {groups.map((group, i) => (
          <View key={group.key} style={[styles.group, i > 0 && styles.groupDivided]}>
            {group.node}
          </View>
        ))}
      </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.background },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nameValue: { flex: 1 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // One card for the whole event. The padding lives on the groups instead, so
    // the rules between them run the full width and read as divisions of one
    // thing rather than as gaps between several.
    // Shadow only — kept off `card` because overflow:'hidden' clips a shadow
    // along with everything else, which on iOS erases it outright.
    cardShadow: {
      marginHorizontal: 16,
      marginTop: 18,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    group: { padding: 12 },
    groupDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    // The editor's input type without the input: same size and colour, no rule
    // underneath it and no padding pretending to be a tap target.
    value: { fontSize: 16, color: C.text },
    whenRow: { flexDirection: 'row', alignItems: 'center' },
    whenRowSpaced: { marginTop: 12 },
    // Fixed width so the two glyphs share a left edge whatever their own widths
    // are, which is what makes the pair read as one block rather than two lines.
    whenIcon: { width: 18, marginRight: 10, textAlign: 'center' },
    repeatChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: C.infoChipBg,
    },
    // flexShrink so a long rule ("Every week on Sun, Mon, …") wraps inside the
    // chip instead of pushing it past the card.
    repeatTextBlock: { flexShrink: 1 },
    repeatText: { fontSize: 13, fontWeight: '500', color: C.textSecondary },
    // Subordinated by weight, not colour: `textLight` is *brighter* than
    // `textSecondary` in dark mode, so dimming with it would invert the
    // hierarchy on one theme.
    repeatUntil: { fontWeight: '400', marginTop: 2 },
    inlineValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // Text on the left, big glyph/checkbox on the right — matches the edit
    // form's switchRow layout exactly, since these are the same controls at
    // the same size.
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // No box: this is read-only display text, not the editor's tappable input.
    quantityBox: {
      fontSize: 22,
      fontWeight: '700',
      color: C.text,
      textAlign: 'left',
    },
    // Size/weight match the editor's unitsBox; colour matches EventBlock's
    // own units text — the annotation treatment, not the value's own colour.
    quantityUnits: { fontSize: 16, fontWeight: '600', color: C.textSecondary },
    colorDot: { width: 14, height: 14, borderRadius: 7 },
    personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
    // Only between rows: a rule under the last one would read as an input's underline.
    personRowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    personIcon: { marginRight: 10 },
    personName: { flex: 1, fontSize: 15, color: C.text },
  });
}
