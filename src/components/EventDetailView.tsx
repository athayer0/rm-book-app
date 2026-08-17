import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
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
import { StatusPicker, STATUS_LABELS } from './StatusPicker';
import { PERSON_STATUSES, StatusConfig } from '../constants/personStatuses';
import { usePeople, Person } from '../hooks/usePeople';
import { AppSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { MAX_GOAL_VALUE } from '../constants/defaultGoals';

interface Props {
  /**
   * What to show. Built from the editor's own form state rather than taken from
   * the caller's copy of the event, so returning here after Save reads back the
   * values just written — the screens hold a snapshot that doesn't refresh.
   */
  event: CalendarEvent;
  settings: AppSettings;
  status: EventStatus | undefined;
  /** Absent when the caller doesn't track status, which makes the row read-only. */
  onStatusChange?: (status: EventStatus | undefined) => void;
  /** Absent when the caller doesn't persist quantity, which makes the stepper read-only. */
  onQuantityChange?: (quantity: number) => void;
  /** Absent hides the trash icon — the caller owns confirmation and the actual delete. */
  onDelete?: () => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function longDate(dateStr: string): string {
  return format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMM d, yyyy');
}

function shortDate(dateStr: string): string {
  return format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy');
}

/** "Every week on Mon, Wed" — the series in one line, without its end date. */
function recurrenceSummary(event: CalendarEvent): string {
  if (event.recurringRule === 'daily') return 'Every day';
  if (event.recurringRule === 'monthly') return 'Every month';
  // Weekly, including a series saved before per-day selection existed: those
  // repeat on the start date's own weekday.
  const days = event.recurringDays?.length
    ? event.recurringDays
    : [new Date(event.date + 'T12:00:00').getDay()];
  return `Every week on ${[...days].sort((a, b) => a - b).map(d => WEEKDAY_NAMES[d]).join(', ')}`;
}

// Smaller than StatusPicker's icons: a filled/outlined box reads heavier than a
// glyph at the same size, so it needs to sit smaller to match their visual weight.
const CHECKBOX_SIZE = 38;

/**
 * An event as it stands, with nothing offering to be typed in.
 *
 * The same uppercase labels as the editor, minus every affordance: no underlines
 * beneath values, no chevrons, no remove buttons. Unlike the editor, which gives
 * each field a card of its own, everything here — including the title — shares
 * one card and is separated by rules, reading as a page about the event rather
 * than a stack of things to fill in.
 *
 * Two things stay live here rather than moving to the editor: the reported
 * status, and a quantity-type event's count — both are actions taken on the
 * event (report it, log another rep) rather than fields you go fill in.
 *
 * Empty fields are dropped rather than shown blank, so what's here is what the
 * event actually has.
 */
export function EventDetailView({ event, settings, status, onStatusChange, onQuantityChange, onDelete }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { people: allPeople } = usePeople();
  const { byId: eventTypeById } = useEventTypeDefinitions();

  const peopleById = useMemo(
    () => new Map(allPeople.map(p => [p.id, p])),
    [allPeople],
  );

  // Local text for the quantity box, so a partially-typed value ("1" on the way
  // to "12") isn't clobbered by the prop re-deriving from event.quantity on
  // every keystroke's re-render. Only resynced while the box isn't focused —
  // committing happens on blur, via onQuantityChange.
  const [quantityText, setQuantityText] = useState(String(event.quantity ?? 0));
  const [quantityFocused, setQuantityFocused] = useState(false);
  useEffect(() => {
    if (!quantityFocused) setQuantityText(String(event.quantity ?? 0));
  }, [event.id, event.quantity, quantityFocused]);

  function commitQuantity() {
    setQuantityFocused(false);
    const n = parseInt(quantityText, 10);
    const clamped = Number.isNaN(n) ? 0 : Math.min(MAX_GOAL_VALUE, Math.max(0, n));
    setQuantityText(String(clamped));
    if (clamped !== (event.quantity ?? 0)) onQuantityChange?.(clamped);
  }

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
        <Text style={styles.label}>Name</Text>
        <View style={styles.nameRow}>
          <Text style={[styles.value, styles.nameValue]}>{event.title}</Text>
          {isBackup && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Backup</Text>
            </View>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Delete event"
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
          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.value}>
              {isStatusCheckbox
                ? (status === 'completed' ? 'Completed' : 'Not completed')
                : (status ? STATUS_LABELS[status] : 'None')}
            </Text>
            {isStatusCheckbox ? (
              <TouchableOpacity
                onPress={() => onStatusChange?.(status === 'completed' ? undefined : 'completed')}
                disabled={!onStatusChange}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: status === 'completed' }}
              >
                <StatusCheckbox checked={status === 'completed'} size={CHECKBOX_SIZE} color={color} />
              </TouchableOpacity>
            ) : (
              <StatusPicker value={status} onChange={s => onStatusChange?.(s)} />
            )}
          </View>
        </>
      ),
    });
  }

  if (!isBackup && eventTypeById[event.type]?.goalMode === 'quantity') {
    groups.push({
      key: 'quantity',
      node: (
        <>
          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.quantityBox}
            value={quantityText}
            onChangeText={setQuantityText}
            onFocus={() => setQuantityFocused(true)}
            onBlur={commitQuantity}
            editable={!!onQuantityChange}
            keyboardType="number-pad"
            selectTextOnFocus
            maxLength={3}
            accessibilityLabel="Quantity"
          />
        </>
      ),
    });
  }

  groups.push({
    key: 'type',
    node: (
      <>
        <Text style={styles.label}>Event Type</Text>
        <View style={styles.inlineValue}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <Text style={styles.value}>{eventTypeById[event.type]?.label ?? event.type}</Text>
        </View>
      </>
    ),
  });

  if (usesContactMethod(event.type)) {
    groups.push({
      key: 'method',
      node: (
        <>
          <Text style={styles.label}>{methodFieldLabel(event.type)}</Text>
          <View style={styles.inlineValue}>
            <GoalIcon
              icon={CONTACT_METHODS[method].icon}
              iconFamily={CONTACT_METHODS[method].iconFamily}
              size={16}
              color={Colors.textSecondary}
            />
            <Text style={styles.value}>{contactMethodLabel(method)}</Text>
          </View>
        </>
      ),
    });
  }

  groups.push({
    key: 'when',
    node: (
      <>
        <Text style={styles.label}>When</Text>
        <Text style={styles.value}>{longDate(event.date)}</Text>
        <Text style={[styles.value, styles.valueSpaced]}>
          {isCheckboxType(event.type) || !hasEndTime(event)
            ? event.startTime
            : `${event.startTime} – ${event.endTime}`}
        </Text>
        {event.recurring && (
          <>
            <Text style={[styles.value, styles.valueSpaced]}>{recurrenceSummary(event)}</Text>
            {!!event.recurringUntil && (
              <Text style={styles.subValue}>Until {shortDate(event.recurringUntil)}</Text>
            )}
          </>
        )}
      </>
    ),
  });

  if (attendees.length > 0) {
    groups.push({
      key: 'people',
      node: (
        <>
          <Text style={styles.label}>People</Text>
          {attendees.map((id, i) => {
            const attendee = peopleById.get(id);
            return (
              <View key={id} style={[styles.personRow, i > 0 && styles.personRowDivided]}>
                <StatusIcon config={statusConfigOf(attendee)} size={18} style={styles.personIcon} />
                <Text style={styles.personName} numberOfLines={1}>
                  {attendee?.name ?? 'Unknown person'}
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
          <Text style={styles.label}>Notes</Text>
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
    valueSpaced: { marginTop: 4 },
    subValue: { fontSize: 13, color: C.textLight, marginTop: 2 },
    inlineValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    colorDot: { width: 14, height: 14, borderRadius: 7 },
    personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
    // Only between rows: a rule under the last one would read as an input's underline.
    personRowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    personIcon: { marginRight: 10 },
    personName: { flex: 1, fontSize: 15, color: C.text },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    // Matches GoalWeeklyModal's numPill: a filled rounded box holding a large
    // number, right-aligned in its row rather than centred in one — this row
    // has nothing to its left the way that pill's icon-and-label do.
    quantityBox: {
      alignSelf: 'flex-end',
      minWidth: 60,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: C.background,
      fontSize: 22,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
    },
  });
}
