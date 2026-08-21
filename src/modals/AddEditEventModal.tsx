import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeConfig } from '../constants/colors';
import {
  CalendarEvent, EventStatus, RecurringRule, defaultRecurrenceEnd,
  isCheckboxType, hasOptionalEnd, resolveEventStatus,
} from '../utils/eventUtils';
import {
  CONTACT_METHODS, contactMethodLabel, methodFieldLabel,
  methodOptionsFor, resolveContactMethod, usesContactMethod,
} from '../constants/contactMethods';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';
import { dateFnsLocale, datePattern } from '../utils/dateFnsLocale';
import { InlineDatePicker } from '../components/InlineDatePicker';
import { DropdownMenu, DropdownItem, Collapsible, MenuScrollView } from '../components/DropdownMenu';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { EventDetailView } from '../components/EventDetailView';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { addMinutesToTimeString, parseTimeString, weekdayInitial, displayTime } from '../utils/dateUtils';
import { AppSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { usePeople, Person } from '../hooks/usePeople';
import { PERSON_STATUSES, StatusConfig } from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { PersonPickerModal } from './PersonPickerModal';
import { format } from 'date-fns';

interface Props {
  visible: boolean;
  event?: CalendarEvent | null;
  defaultDate?: string;
  defaultStartTime?: string;
  /**
   * Seeds a *new* event with more than a date and time — the auto-captured
   * contact arrives with its type, person and method already known. Ignored when
   * `event` is set. Must be referentially stable: it feeds the reset effect, so
   * an object rebuilt each render would wipe the form on every keystroke.
   */
  prefill?: Partial<CalendarEvent> | null;
  settings: AppSettings;
  currentStatus?: EventStatus;
  onStatusChange?: (status: EventStatus | undefined) => void;
  /** `scope` is set only when saving an edit to a recurring event's series row —
   *  'single' carves off just this occurrence, 'future' splits the series at it.
   *  Absent for a non-recurring event or a brand-new one, where there's nothing to scope. */
  onSave: (event: Omit<CalendarEvent, 'id'>, scope?: 'single' | 'future') => Promise<void>;
  /** 'single' drops just occurrenceDate; 'future' ends the series before it. */
  onDelete?: (id: string, occurrenceDate: string, mode: 'single' | 'future') => void;
  onClose: () => void;
}

// Ends on half a row rather than a whole one, so a list longer than this says so
// by being visibly cut. MenuScrollView turns it into a height off MENU_ITEM_HEIGHT
// and scrolls the selected row to the top by the same measure.
const TYPE_MENU_ROWS = 4.5;

function resolvedColor(type: string, settings: AppSettings): string {
  return settings.eventTypeColors[type] ?? EventColors[type] ?? '#00B5C8';
}

// Checkbox events (task) have no duration, so they contribute no minutes; every
// other type falls back to its configured default. No type is treated as a 15-minute event.
// An optional-end type starts at zero too — it gets an end only if one is asked for.
function resolvedDefaultMinutes(type: string, settings: AppSettings): number {
  if (isCheckboxType(type) || hasOptionalEnd(type)) return 0;
  return settings.eventTypeDefaultMinutes[type] ?? EventTypeConfig[type]?.defaultMinutes ?? 30;
}

// What "Add end time" offers as a starting length, since the type's own default is 0.
const ADDED_END_MINUTES = 30;

function minutesBetween(startTime: string, endTime: string): number {
  const start = parseTimeString(startTime);
  const end = parseTimeString(endTime);
  const diff = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
  return diff > 0 ? diff : diff + 24 * 60;
}

function weekdayOf(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

type PickerId = 'type' | 'date' | 'start' | 'end' | 'rule' | 'endsOn' | 'method';

/**
 * The pickers that float over the fields below. The rest — Date, the two time
 * wheels, the recurrence Ends date — open in the flow and push the fields down
 * instead.
 *
 * Only these are dismissed by tapping away. A panel that moved the page to make
 * room for itself is something you work *inside*, not a menu hovering over your
 * work: closing one on a stray tap would take back the space it just made and
 * shift everything under your finger. Those close from their own row, or by
 * choosing a value.
 */
const FLOATING_PICKERS: PickerId[] = ['type', 'method', 'rule'];

export function AddEditEventModal({ visible, event, defaultDate, defaultStartTime, prefill, settings, currentStatus, onStatusChange, onSave, onDelete, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { people: allPeople } = usePeople();
  const { definitions, byId: eventTypeById } = useEventTypeDefinitions();

  // The type dropdown's list must include the event's current type even if it
  // has since been deleted — otherwise editing an existing event strands it off
  // its own picker.
  const EVENT_TYPES = useMemo(() => {
    const ids = definitions.map(d => d.id);
    const current = event?.type;
    return current && !ids.includes(current) ? [...ids, current] : ids;
  }, [definitions, event?.type]);

  function typeLabel(typeId: string): string {
    return eventTypeById[typeId] ? eventTypeDisplayLabel(eventTypeById[typeId], t) : typeId;
  }

  /**
   * What the event's status actually is, rather than only what has been written.
   *
   * Callers hand over the stored status, which is empty for anything never
   * reported — so a past scripture block opened here read as "None" while the
   * calendar badge and the unreported backlog were both already calling it
   * pending. Resolving here rather than at the call sites covers both entry
   * points and leaves no third one to get it wrong.
   *
   * Display only: status is pushed out through onStatusChange on tap, and
   * CalendarEvent has no status field for onSave to carry, so opening this and
   * closing it writes nothing. Pending stays derived.
   */
  const resolvedStatus = event ? resolveEventStatus(event, currentStatus, eventTypeById) : undefined;

  const [title, setTitle] = useState('');
  // 'scripture' as a last-resort fallback only matters if every type has been
  // deleted — definitions is always non-empty otherwise.
  const [type, setType] = useState(() => definitions[0]?.id ?? 'scripture');
  const [localStatus, setLocalStatus] = useState<EventStatus | undefined>(resolvedStatus);
  const [date, setDate] = useState(defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('9:00 AM');
  const [endTime, setEndTime] = useState('9:30 AM');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [recurringRule, setRecurringRule] = useState<RecurringRule>('weekly');
  const [endsOn, setEndsOn] = useState(() => defaultRecurrenceEnd(defaultDate ?? format(new Date(), 'yyyy-MM-dd'), 'weekly'));
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [isBackup, setIsBackup] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [contactMethod, setContactMethod] = useState(settings.defaultContactMethod);
  const [quantity, setQuantity] = useState(0);
  const [units, setUnits] = useState('');
  // One picker open at a time — a single value makes that structural instead of
  // something six separate booleans have to agree on.
  const [openPicker, setOpenPicker] = useState<PickerId | null>(null);
  const showTypePicker = openPicker === 'type';
  const showDatePicker = openPicker === 'date';
  const showStartPicker = openPicker === 'start';
  const showEndPicker = openPicker === 'end';
  const showRulePicker = openPicker === 'rule';
  const showEndsOnPicker = openPicker === 'endsOn';
  const showMethodPicker = openPicker === 'method';
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  // Which free-text field has the keyboard, so it can draw its focus edge. One
  // value rather than a boolean each, for the same reason `openPicker` is one:
  // only one of them can be focused, and two booleans could disagree about it.
  const [focusedField, setFocusedField] = useState<'title' | 'notes' | null>(null);
  /**
   * An event that already exists opens as a page about itself; only editing it
   * shows the form. A new one has nothing to display, so it starts in the form
   * and never returns here — Cancel and Save both close it outright.
   */
  const [mode, setMode] = useState<'view' | 'edit'>(event ? 'view' : 'edit');
  const [error, setError] = useState('');

  /**
   * Seed every field from the event, or from the defaults for a new one.
   *
   * Also what Cancel calls: leaving edit mode has to put back what was there,
   * since the sheet stays open on the display view rather than being torn down.
   */
  function resetForm() {
    if (event) {
      setTitle(event.title);
      setType(event.type);
      setDate(event.date);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setNotes(event.notes ?? '');
      const rule = event.recurringRule ?? 'weekly';
      setRecurring(event.recurring);
      setRecurringRule(rule);
      // Series predating end dates have none stored; offer the default rather than a blank.
      setEndsOn(event.recurringUntil ?? defaultRecurrenceEnd(event.date, rule));
      // Weekly series predating per-day selection repeated on the start weekday, so default to it.
      setRecurringDays(
        event.recurringDays ??
        (event.recurring && rule === 'weekly' ? [weekdayOf(event.date)] : [])
      );
      setIsBackup(event.backup ?? false);
      setAttendees(event.people ?? []);
      setContactMethod(resolveContactMethod(event.contactMethod, event.type));
      setQuantity(event.quantity ?? 0);
      setUnits(event.units ?? '');
    } else {
      const initialType = prefill?.type ?? definitions[0]?.id ?? 'scripture';
      const initialStart = prefill?.startTime ?? defaultStartTime ?? '9:00 AM';
      const initialDate = prefill?.date ?? defaultDate ?? format(new Date(), 'yyyy-MM-dd');
      setTitle(prefill?.title ?? '');
      setType(initialType);
      setDate(initialDate);
      setStartTime(initialStart);
      setEndTime(prefill?.endTime ?? addMinutesToTimeString(initialStart, resolvedDefaultMinutes(initialType, settings)));
      setNotes('');
      setRecurring(false);
      setRecurringRule('weekly');
      setEndsOn(defaultRecurrenceEnd(initialDate, 'weekly'));
      setRecurringDays([]);
      setIsBackup(false);
      setAttendees(prefill?.people ?? []);
      // New event, so the user's default seeds it — unlike the branch above,
      // where an existing event's stored method is the whole answer.
      setContactMethod(resolveContactMethod(prefill?.contactMethod, initialType, settings.defaultContactMethod));
      setQuantity(prefill?.quantity ?? 0);
      setUnits(prefill?.units ?? '');
    }
    setOpenPicker(null);
    setShowPersonPicker(false);
    setError('');
  }

  useEffect(() => {
    resetForm();
    setMode(event ? 'view' : 'edit');
    // resetForm reads a good deal more than this lists, but every one of those is
    // either a prop covered here or state it only writes. `currentStatus` in
    // particular is deliberately absent: reporting a status from the display view
    // pushes a new one down as a prop, and re-running this would throw away an
    // edit in progress. The status itself is carried by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, defaultDate, defaultStartTime, prefill, visible]);

  useEffect(() => {
    setLocalStatus(resolvedStatus);
    // resolvedStatus is read but not listed: it consults the clock, so listing it
    // would re-run this the minute an event's start time passed. Its other inputs
    // — `event` and `currentStatus` — are both here, so it stays in step with
    // everything that can actually change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, currentStatus, visible]);

  // Reporting happens on the display view now. Both controls there hand back the
  // status they resolve to, including undefined when the active one is tapped
  // again, so this just adopts it and passes it on.
  function handleStatusTap(next: EventStatus | undefined) {
    setLocalStatus(next);
    onStatusChange?.(next);
  }

  // Quantity is set from the display view too, and — unlike status — it's a
  // field on the event itself rather than a separate tracked value, so
  // committing a tap here means writing straight through onSave instead of
  // waiting on the form's own Save button. buildEventData() reads `quantity`
  // out of state, which setQuantity above hasn't applied yet by the time this
  // runs, so the new value is spliced in after rather than trusted to state.
  async function handleQuantityChange(newQuantity: number) {
    setQuantity(newQuantity);
    try {
      await onSave({ ...buildEventData(), quantity: newQuantity });
    } catch (e) {
      console.error('[AddEditEventModal] quantity save failed:', e);
      setError(t('addEditEvent.quantitySaveFailed'));
    }
  }

  // Units commit from the display view the same way, and for the same reason
  // have to be spliced past state that hasn't applied yet. Empty means cleared,
  // so it goes as undefined — toRow turns that into a null column, where '' would
  // leave the block drawing a unit made of nothing.
  async function handleUnitsChange(newUnits: string) {
    setUnits(newUnits);
    try {
      await onSave({ ...buildEventData(), units: newUnits || undefined });
    } catch (e) {
      console.error('[AddEditEventModal] units save failed:', e);
      setError(t('addEditEvent.unitsSaveFailed'));
    }
  }

  function handleTypeChange(newType: string) {
    setType(newType);
    if (!title) setTitle(typeLabel(newType));
    setEndTime(addMinutesToTimeString(startTime, resolvedDefaultMinutes(newType, settings)));
    // Types offer different methods, so a retype can strand the current one on a
    // list that no longer contains it.
    // Retyping is a fresh choice of method, so the default applies again: the
    // current one carries over only where the new type also offers it.
    setContactMethod(resolveContactMethod(contactMethod, newType, settings.defaultContactMethod));
    closePickers();
  }

  // Moving the start normally re-applies the type's default length. An end time
  // added by hand is not a default, so it slides with the start instead of being
  // discarded — otherwise the only way to correct a contact's start time is to
  // re-enter its end time afterwards.
  //
  // Doesn't close the picker: the wheel commits on every column it settles
  // (hour, then minute, then period), so closing after the first would strand
  // the other two at their old values.
  function handleStartTimeChange(t: string) {
    const keepDuration = hasOptionalEnd(type) && endTime !== startTime;
    setStartTime(t);
    setEndTime(addMinutesToTimeString(
      t,
      keepDuration ? minutesBetween(startTime, endTime) : resolvedDefaultMinutes(type, settings),
    ));
  }

  // End equal to start is how "no end time" is stored, so adding and removing one
  // is just moving between that and a real duration.
  function addEndTime() {
    setEndTime(addMinutesToTimeString(startTime, ADDED_END_MINUTES));
    setOpenPicker('end');
  }

  function removeEndTime() {
    setEndTime(startTime);
    closePickers();
  }

  function toggleAttendee(personId: string) {
    setAttendees(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId]
    );
  }

  // Each rule carries its own default span, so switching rules re-applies it.
  function changeRule(rule: RecurringRule) {
    setRecurringRule(rule);
    setEndsOn(defaultRecurrenceEnd(date, rule));
    // Weekly needs at least one day; seed with the start weekday if none are chosen yet.
    if (rule === 'weekly') setRecurringDays(prev => (prev.length ? prev : [weekdayOf(date)]));
  }

  function handleRecurringToggle(val: boolean) {
    // This control sits above the dismiss backdrop (its section has to, for the
    // Frequency/Ends triggers), so it closes any open picker itself.
    closePickers();
    setRecurring(val);
    if (val && recurringRule === 'weekly') {
      setRecurringDays(prev => (prev.length ? prev : [weekdayOf(date)]));
    }
  }

  // Weekly repeats on the tapped days; keep at least one selected.
  function toggleDay(day: number) {
    closePickers();
    setRecurringDays(prev => {
      if (prev.includes(day)) {
        return prev.length === 1 ? prev : prev.filter(d => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }

  function handleDelete() {
    if (!event || !onDelete) return;
    if (!event.recurring) {
      Alert.alert(
        t('addEditEvent.deleteEventTitle'),
        t('addEditEvent.deleteEventBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => { onDelete(event.id, event.date, 'single'); onClose(); },
          },
        ],
        { cancelable: true }
      );
      return;
    }
    Alert.alert(
      t('addEditEvent.deleteRecurringTitle'),
      t('addEditEvent.deleteRecurringBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('calendar.thisEventOnly'),
          style: 'destructive',
          onPress: () => { onDelete(event.id, event.date, 'single'); onClose(); },
        },
        {
          text: t('calendar.thisAndAllFuture'),
          style: 'destructive',
          onPress: () => { onDelete(event.id, event.date, 'future'); onClose(); },
        },
      ],
      { cancelable: true }
    );
  }

  /**
   * The event the form currently describes.
   *
   * Shared by Save and by the display view, so what the page reads back after a
   * save is exactly what was written. Rendering the display view off the `event`
   * prop instead would show stale values — the screens hold a snapshot taken when
   * the sheet opened and never refresh it.
   */
  function buildEventData(): Omit<CalendarEvent, 'id'> {
    return {
      title: title.trim() || typeLabel(type),
      type,
      color: resolvedColor(type, settings),
      date,
      startTime,
      // Checkbox events have only a start time; store the end equal to it (a 0-minute event).
      endTime: isCheckboxType(type) ? startTime : endTime,
      notes: notes.trim(),
      recurring,
      recurringRule: recurring ? recurringRule : undefined,
      recurringUntil: recurring ? endsOn : undefined,
      recurringDays: recurring && recurringRule === 'weekly'
        ? (recurringDays.length ? recurringDays : [weekdayOf(date)])
        : undefined,
      excludedDates: recurring ? event?.excludedDates : undefined,
      backup: isBackup,
      // undefined rather than [] / '' for the empty cases: toRow maps it to a
      // null column, so clearing the last person off an event syncs as a clear.
      people: attendees.length ? attendees : undefined,
      contactMethod: usesContactMethod(type) ? contactMethod : undefined,
      quantity: eventTypeById[type]?.goalMode === 'quantity' ? quantity : undefined,
      units: eventTypeById[type]?.goalMode === 'quantity' && units ? units : undefined,
    };
  }

  /**
   * A recurring event's fields belong to the whole series, so saving one always
   * asks which occurrences the edit applies to before anything is written —
   * the same question, and the same two answers, handleDelete already asks.
   * A non-recurring event or a brand-new one has no series to scope, so it
   * saves straight through.
   */
  function handleSave() {
    if (!event || !event.recurring) {
      commitSave();
      return;
    }
    Alert.alert(
      t('calendar.recurringEventTitle'),
      t('addEditEvent.recurringUpdateBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('calendar.thisEventOnly'), onPress: () => commitSave('single') },
        { text: t('calendar.thisAndAllFuture'), onPress: () => commitSave('future') },
      ],
      { cancelable: true }
    );
  }

  async function commitSave(scope?: 'single' | 'future') {
    setError('');
    try {
      await onSave(buildEventData(), scope);
      // Otherwise a picker left open (Start Time, End Time) is still open
      // underneath when Edit reopens the form, since switching to 'view'
      // doesn't tear the form down.
      closePickers();
      // An existing event has a page to go back to; a new one does not.
      if (event) setMode('view'); else onClose();
    } catch (e) {
      console.error('[AddEditEventModal] onSave failed:', e);
      setError(t('addEditEvent.eventSaveFailed'));
    }
  }

  function handleCancel() {
    if (!event) { onClose(); return; }
    resetForm();
    setMode('view');
  }

  const fixed = isCheckboxType(type);
  // An optional-end type with end === start has no end time yet; every other type
  // always shows the picker, so a meal that happens to end when it starts is not
  // mistaken for one still awaiting an end.
  const endOmitted = hasOptionalEnd(type) && endTime === startTime;
  const peopleById = useMemo(
    () => new Map(allPeople.map(p => [p.id, p])),
    [allPeople],
  );
  /**
   * The marker the People tab would draw for this person.
   *
   * The fallback is a real runtime case despite the types: PERSON_STATUSES is a
   * Record, so indexing it is typed as always finding something, but a person
   * carrying a status this build no longer defines — or an id with no person
   * behind it at all — lands here.
   */
  function statusConfigOf(candidate: Person | undefined): StatusConfig {
    return PERSON_STATUSES[candidate?.status ?? ''] ?? { color: Colors.textLight, icon: 'ellipse', shape: 'dot' };
  }

  const floatingPickerOpen = openPicker !== null && FLOATING_PICKERS.includes(openPicker);

  /** Tap-away dismissal — deliberately blind to the in-flow pickers. */
  function closeFloatingPicker() {
    if (floatingPickerOpen) setOpenPicker(null);
  }

  function closePickers() {
    setOpenPicker(null);
  }

  function togglePicker(which: PickerId) {
    setOpenPicker(cur => (cur === which ? null : which));
  }

  /**
   * Which group wins the paint order. Lags `openPicker` on the way down and only
   * ever moves to another open picker, never back to null: a menu animates out
   * over ~130ms and `openPicker` is already null for all of it, so dropping the
   * zIndex on close would send the menu behind the fields below for its whole
   * exit. Leaving the last group elevated afterwards is harmless — nothing is
   * drawn there to overlap anything.
   */
  const [elevatedPicker, setElevatedPicker] = useState<PickerId | null>(null);
  useEffect(() => {
    if (openPicker) setElevatedPicker(openPicker);
  }, [openPicker]);

  // Narrowed rather than a bare boolean so the display view can read the id off it.
  const viewedEvent = mode === 'view' ? event : null;

  return (
    <SheetModal visible={visible} onClose={onClose}>
        <View style={styles.header}>
          {viewedEvent ? (
            <>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                {/* 24, the same as the edit header's × and back arrow. The
                    header has no fixed height, so it takes its size from the
                    tallest thing in it — a glyph 2pt smaller here made the
                    whole bar shorter than the edit one, and switching modes
                    shifted everything below it. */}
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{t('addEditEvent.eventTitle')}</Text>
              <TouchableOpacity onPress={() => setMode('edit')} style={styles.headerRightBtn}>
                <Text style={styles.save}>{t('common.edit')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* The glyph says which of the two things leaving does. Editing an
                  event that exists steps back to the page about it, so an arrow;
                  a new event has no page behind it and the form is the sheet, so
                  an ×, the same mark that closes it from the display view. */}
              <TouchableOpacity
                onPress={handleCancel}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel={event ? t('common.back') : t('common.close')}
              >
                {event
                  ? <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
                  : <Ionicons name="close" size={24} color={Colors.textSecondary} />}
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{event ? t('addEditEvent.editEventTitle') : t('addEditEvent.newEventTitle')}</Text>
              <TouchableOpacity onPress={handleSave} style={styles.headerRightBtn}>
                <Text style={styles.save}>{t('common.save')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        {viewedEvent ? (
          <EventDetailView
            event={{ id: viewedEvent.id, ...buildEventData() }}
            settings={settings}
            status={localStatus}
            onStatusChange={onStatusChange ? handleStatusTap : undefined}
            onQuantityChange={handleQuantityChange}
            onUnitsChange={handleUnitsChange}
            onDelete={onDelete ? handleDelete : undefined}
          />
        ) : (
        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets bounces={false} overScrollMode="never">
          {floatingPickerOpen && (
            <Pressable style={styles.pickerBackdrop} onPress={closeFloatingPicker} />
          )}

          <View style={styles.card}>
          {floatingPickerOpen && (
            <Pressable style={styles.cardBackdrop} onPress={closeFloatingPicker} />
          )}
          <View style={styles.group}>
            <Text style={styles.label}>{t('eventDetail.title')}</Text>
            <View style={styles.titleRow}>
              <TextInput
                style={[styles.input, styles.titleInput, focusedField === 'title' && styles.inputFocused]}
                value={title}
                onChangeText={setTitle}
                onFocus={() => { closePickers(); setFocusedField('title'); }}
                onBlur={() => setFocusedField(null)}
                placeholder={typeLabel(type) || t('addEditEvent.eventTitlePlaceholder')}
                placeholderTextColor={Colors.textLight}
              />
              {event && onDelete && (
                <TouchableOpacity
                  onPress={handleDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('eventDetail.deleteEvent')}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.group, styles.columns, styles.pickerRow, elevatedPicker === 'type' && styles.openPickerRow]}>
            <View style={styles.column}>
              <Text style={styles.label}>{t('eventDetail.eventType')}</Text>
              <View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('type')}>
                  <View style={[styles.colorDot, { backgroundColor: resolvedColor(type, settings) }]} />
                  <Text style={styles.pickerText}>{typeLabel(type)}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                <DropdownMenu open={showTypePicker}>
                  <MenuScrollView
                    open={showTypePicker}
                    selectedIndex={EVENT_TYPES.indexOf(type)}
                    maxRows={TYPE_MENU_ROWS}
                  >
                    {EVENT_TYPES.map((t, i) => (
                      <DropdownItem
                        key={t}
                        label={typeLabel(t)}
                        selected={type === t}
                        showSeparator={i < EVENT_TYPES.length - 1}
                        leading={<View style={[styles.colorDot, { backgroundColor: resolvedColor(t, settings) }]} />}
                        onPress={() => handleTypeChange(t)}
                      />
                    ))}
                  </MenuScrollView>
                </DropdownMenu>
              </View>
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>{t('addEditEvent.date')}</Text>
              <TouchableOpacity style={styles.picker} onPress={() => togglePicker('date')}>
                <Text style={styles.pickerText}>{format(new Date(date + 'T12:00:00'), datePattern('monthDayYear', settings.language), { locale: dateFnsLocale(settings.language) })}</Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
          {/* A group of its own rather than a panel hanging off the row: it
              belongs to the Date field above it, and reads that way sitting
              directly beneath it inside the same card. */}
          {/* openPickerRow goes on the Collapsible itself, not the group inside
              it: the zIndex has to land on the element that is actually a
              sibling of the other groups, and the Collapsible's animated
              container is now that element. */}
          <Collapsible open={showDatePicker} style={styles.openPickerRow}>
            <View style={[styles.group, { paddingTop: 4 }]}>
              {/* Picking a day deliberately leaves the panel open — it closes
                  from the Date row itself, by opening another picker, or on
                  Save/back (handleSave and resetForm both clear openPicker).
                  Same as the time wheels below, which have never closed on a
                  value change either: a date is something you may well change
                  twice, and snapping shut on the first tap makes correcting it
                  a matter of reopening the panel. */}
              <InlineDatePicker
                value={date}
                weekStart={settings.weekStart}
                onChange={setDate}
              />
            </View>
          </Collapsible>

          <View style={[styles.group, styles.columns, styles.pickerRow, (elevatedPicker === 'start' || elevatedPicker === 'end') && styles.openPickerRow]}>
            <View style={styles.column}>
              <Text style={styles.label}>{t('addEditEvent.startTime')}</Text>
              <TouchableOpacity style={styles.picker} onPress={() => togglePicker('start')}>
                <Text style={styles.pickerText}>{displayTime(startTime, settings.language, settings.timeFormat)}</Text>
                <Ionicons name={showStartPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>

            {!fixed && endOmitted && (
              <View style={styles.column}>
                <Text style={styles.label}>{t('addEditEvent.endTime')}</Text>
                <TouchableOpacity style={styles.picker} onPress={addEndTime}>
                  <Ionicons name="add-circle-outline" size={16} color={Colors.control} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerText, styles.pickerActionText]}>{t('addEditEvent.addEndTime')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {!fixed && !endOmitted && (
              <View style={styles.column}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>{t('addEditEvent.endTime')}</Text>
                  {hasOptionalEnd(type) && (
                    <TouchableOpacity
                      onPress={removeEndTime}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('addEditEvent.removeEndTime')}
                    >
                      <Ionicons name="close" size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('end')}>
                  <Text style={styles.pickerText}>{displayTime(endTime, settings.language, settings.timeFormat)}</Text>
                  <Ionicons name={showEndPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Which time it is editing reads off `elevatedPicker`, not
              `showStartPicker`: the latter is already false for the whole
              collapse, so the wheel would flip to the end time and animate away
              showing the wrong number. elevatedPicker holds the last one opened. */}
          <Collapsible open={showStartPicker || showEndPicker} style={styles.openPickerRow}>
            <View style={[styles.group, { paddingTop: 4 }]}>
              <TimeWheelPicker
                value={elevatedPicker === 'start' ? startTime : endTime}
                onChange={elevatedPicker === 'start' ? handleStartTimeChange : setEndTime}
              />
            </View>
          </Collapsible>

          {/* Two-thirds of the row, with the rest left empty: the value is a short
              label off a fixed list, and stretching it the full width made it
              read as a longer field than it is. */}
          {usesContactMethod(type) && (
            <View style={[styles.group, styles.columns, styles.pickerRow, elevatedPicker === 'method' && styles.openPickerRow]}>
              <View style={[styles.column, styles.columnWide]}>
                <Text style={styles.label}>{methodFieldLabel(type, t)}</Text>
                <View>
                  <TouchableOpacity style={styles.picker} onPress={() => togglePicker('method')}>
                    <GoalIcon
                      icon={CONTACT_METHODS[contactMethod].icon}
                      iconFamily={CONTACT_METHODS[contactMethod].iconFamily}
                      size={16}
                      color={Colors.textSecondary}
                    />
                    <Text style={[styles.pickerText, { marginLeft: 8 }]}>{contactMethodLabel(contactMethod, t)}</Text>
                    <Ionicons name={showMethodPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                  <DropdownMenu open={showMethodPicker}>
                    {methodOptionsFor(type).map((m, i, arr) => (
                      <DropdownItem
                        key={m}
                        label={t(`contactMethods.${m}`, { defaultValue: CONTACT_METHODS[m].label })}
                        selected={contactMethod === m}
                        showSeparator={i < arr.length - 1}
                        labelStyle={{ marginLeft: 8 }}
                        leading={
                          <GoalIcon
                            icon={CONTACT_METHODS[m].icon}
                            iconFamily={CONTACT_METHODS[m].iconFamily}
                            size={16}
                            color={contactMethod === m ? Colors.control : Colors.textSecondary}
                          />
                        }
                        onPress={() => { setContactMethod(m); closePickers(); }}
                      />
                    ))}
                  </DropdownMenu>
                </View>
              </View>
              <View style={styles.column} />
            </View>
          )}

          <View style={[styles.group]}>
            <Text style={styles.label}>{t('eventDetail.people')}</Text>
            {/* Nothing at all when no one is on the event. The label says what
                the group is and the link below says what to do about it; a line
                of prose between them only repeated that the list was empty. */}
            {attendees.length > 0 && (
              <View style={styles.columns}>
                <View style={[styles.column, styles.columnWide]}>
                  {attendees.map(id => {
                    const attendee = peopleById.get(id);
                    return (
                      <View key={id} style={styles.personRow}>
                        <StatusIcon config={statusConfigOf(attendee)} size={18} style={styles.personIcon} />
                        {/* A person deleted (or not yet synced) still has an id on the
                            event; showing the gap is better than dropping them silently. */}
                        <Text style={styles.personName} numberOfLines={1}>
                          {attendee?.name ?? t('eventDetail.unknownPerson')}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { closePickers(); toggleAttendee(id); }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t('addEditEvent.removePerson', { name: attendee?.name ?? t('addEditPerson.thisPerson') })}
                        >
                          <Ionicons name="close" size={16} color={Colors.textLight} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.column} />
              </View>
            )}

            {/* Closes the People group rather than sitting on the background
                below it. One card leaves nowhere below to stand — everything
                after this belongs to other fields — and a link under the list it
                adds to reads the same either way. */}
            <TouchableOpacity
              style={styles.addPersonBtn}
              onPress={() => { closePickers(); setShowPersonPicker(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.control} />
              <Text style={styles.addPersonText}>{t('addEditEvent.addPerson')}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.group]}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('addEditEvent.backupEvent')}</Text>
              <Switch
                value={isBackup}
                // Sits above the dismiss backdrop now that the card does, so it
                // closes any open dropdown itself — the same reason the Recurring
                // switch below it does.
                onValueChange={v => { closePickers(); setIsBackup(v); }}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          <View style={[styles.group, styles.pickerRow, (elevatedPicker === 'rule' || elevatedPicker === 'endsOn') && styles.openPickerRow]}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('addEditEvent.recurring')}</Text>
              <Switch
                value={recurring}
                onValueChange={handleRecurringToggle}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {recurring && (
              <>
                <View style={[styles.columns, { marginTop: 24 }, elevatedPicker === 'rule' && styles.openPickerRow]}>
                  <View style={styles.column}>
                    <Text style={styles.label}>{t('addEditEvent.frequency')}</Text>
                    <View>
                      <TouchableOpacity style={styles.picker} onPress={() => togglePicker('rule')}>
                        <Text style={styles.pickerText}>
                          {t(`addEditEvent.frequencyOption.${recurringRule}`)}
                        </Text>
                        <Ionicons name={showRulePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                      <DropdownMenu open={showRulePicker}>
                        {(['daily', 'weekly', 'monthly'] as const).map((rule, i, arr) => (
                          <DropdownItem
                            key={rule}
                            label={t(`addEditEvent.frequencyOption.${rule}`)}
                            selected={recurringRule === rule}
                            showSeparator={i < arr.length - 1}
                            onPress={() => { changeRule(rule); closePickers(); }}
                          />
                        ))}
                      </DropdownMenu>
                    </View>
                  </View>

                  <View style={styles.column}>
                    <Text style={styles.label}>{t('addEditEvent.ends')}</Text>
                    <TouchableOpacity style={styles.picker} onPress={() => togglePicker('endsOn')}>
                      <Text style={styles.pickerText}>
                        {format(new Date(endsOn + 'T12:00:00'), datePattern('monthDayYear', settings.language), { locale: dateFnsLocale(settings.language) })}
                      </Text>
                      <Ionicons name={showEndsOnPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Same construction as the Date and time-wheel panels above:
                    lifted over its neighbours from the Collapsible itself (the
                    animated container is what's actually a sibling of the other
                    groups), and left open when a day is picked so a date can be
                    corrected without reopening the panel. */}
                <Collapsible open={showEndsOnPicker} style={styles.openPickerRow}>
                  <InlineDatePicker
                    value={endsOn}
                    weekStart={settings.weekStart}
                    minDate={date}
                    onChange={setEndsOn}
                  />
                </Collapsible>

                {recurringRule === 'weekly' && (
                  <View style={styles.dayRow}>
                    {(settings.weekStart === 'monday'
                      ? [1, 2, 3, 4, 5, 6, 0]
                      : [0, 1, 2, 3, 4, 5, 6]
                    ).map(day => {
                      const selected = recurringDays.includes(day);
                      return (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayCircle, selected && styles.dayCircleActive]}
                          onPress={() => toggleDay(day)}
                        >
                          <Text style={[styles.dayCircleText, selected && styles.dayCircleTextActive]}>
                            {weekdayInitial(day, t)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>

          <View style={[styles.group]}>
            <Text style={styles.label}>{t('personFields.notes')}</Text>
            <TextInput
              style={[styles.input, styles.notesInput, focusedField === 'notes' && styles.inputFocused]}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => { closePickers(); setFocusedField('notes'); }}
              onBlur={() => setFocusedField(null)}
              placeholder={t('addEditEvent.addNotesPlaceholder')}
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>

          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
        )}

        {/*
          Nested inside this sheet for the reason UnreportedEventsModal spells
          out: two Modals as siblings race to present from the same view
          controller, while one declared within another's content presents from
          that one and stacks. Selection only reaches the form on Done.
        */}
        <PersonPickerModal
          visible={showPersonPicker}
          selectedIds={attendees}
          onConfirm={ids => { setAttendees(ids); setShowPersonPicker(false); }}
          onClose={() => setShowPersonPicker(false)}
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
    // The display header's ×-and-Edit pair, sized the way EditGoalsModal
    // sizes its close button: equal slots on both ends so the title sits
    // centred whatever the right-hand label says. Wider than a bare "Save"
    // needs, since "Guardar" (Spanish) is long enough to wrap at 60.
    closeBtn: { width: 72, alignItems: 'flex-start' },
    headerRightBtn: { width: 72, alignItems: 'flex-end' },
    save: { fontSize: 16, fontWeight: '600', color: C.accent },
    form: { flex: 1, backgroundColor: C.background },
    /**
     * One card for the whole form, the way the display view has one for the whole
     * event. The padding lives on the groups instead, so the rules between them
     * run the full width and the fields read as parts of one thing.
     *
     * Deliberately no `overflow: 'hidden'`: the dropdowns hang below their rows
     * and the ones near the bottom — Frequency, Ends — reach past the card's own
     * edge. Rounded corners survive without it, since every rule is interior.
     *
     * The zIndex is what lifts the card over the dismiss backdrop; without it an
     * open dropdown paints behind. It costs the backdrop its claim on taps that
     * land on a control, so the controls in here close the pickers themselves.
     */
    card: {
      backgroundColor: C.card,
      marginHorizontal: 16,
      // 18, matching EventDetailView's card exactly. Tapping EDIT swaps one for
      // the other in place, so any difference here is a jump in something that
      // should read as the same card gaining fields, not as a new screen. Same
      // for the radius and shadow below — EventDetailView's card needs a
      // shadow/clip split for its own overflow:'hidden'; this one has no such
      // conflict, so the shadow lands directly on the one view.
      marginTop: 18,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      zIndex: 20,
    },
    // No rule between groups: every field already draws its own edge — a box
    // around the text fields, a hairline under each picker — and one more line
    // between groups reads as another of those rather than as a division. The
    // labels carry the separation instead.
    group: { padding: 12 },
    // Two fields sharing a group's width — type and date, start and end.
    columns: { flexDirection: 'row', gap: 8 },
    column: { flex: 1 },
    // Method only: widens its column from the shared half-row split to 2/3 of
    // the row, since the placeholder column beside it still takes flex: 1.
    columnWide: { flex: 2 },
    // Layers within the card, low to high: plain groups (auto) < any group holding a
    // picker trigger (20) < the group whose picker is open (30). Keeping every trigger
    // above its neighbours is what lets one tap switch dropdowns instead of just dismissing.
    // zIndex only, no elevation — elevation would paint an Android shadow on the rows.
    pickerRow: { zIndex: 20 },
    openPickerRow: { zIndex: 30 },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    // The two free-text fields, and only those. A box rather than the pickers'
    // underline: a picker's value is chosen, so a rule under it is enough, but
    // these are typed into and want a target to tap and a shape to hold the text.
    //
    // The border is drawn at full width in both states and only changes colour on
    // focus — thickening it instead would reflow the text inside by half a point
    // on every focus, which reads as the field twitching.
    input: {
      fontSize: 16,
      color: C.text,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    // `control`, not `primary`: this is interactive furniture saying where the
    // keyboard is pointed, the same as a checkmark or an active pill.
    inputFocused: { borderColor: C.control },
    notesInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: 10 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    titleInput: { flex: 1 },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    // The label plus a trailing affordance (the × that drops an optional end time),
    // carrying the 8pt gap the bare label would otherwise supply itself.
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 8 },
    pickerText: { flex: 1, fontSize: 16, color: C.text },
    // A picker row that adds something rather than showing a current value.
    pickerActionText: { fontSize: 15, color: C.control, fontWeight: '500' },
    // The People tab's row, scaled down to sit inside a form section: same
    // status-marker-then-name reading, tighter type and spacing. It borrows the
    // shape rather than the component because a row here removes rather than opens.
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
    },
    personIcon: { marginRight: 10 },
    personName: { flex: 1, fontSize: 15, color: C.text },
    // The person editor's "Add contact method" / "Add address" rows, since all
    // three do the same thing: a ⊕ and a label that opens something rather than
    // committing anything. Same glyph, size, weight and colour as those.
    addPersonBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      // Shrunk to its own width and left-aligned, so it starts on the same edge
      // as the PEOPLE label and the names above it, and the tap target is the
      // link rather than the full width of the card. The person editor's rows
      // are the full width because they are alone in their group; this one
      // follows a list it adds to.
      alignSelf: 'flex-start',
      gap: 8,
      marginTop: 8,
      paddingVertical: 6,
    },
    addPersonText: { fontSize: 15, fontWeight: '500', color: C.control },
    /**
     * Dismisses an open floating picker on a tap outside the card. Stays below
     * the card (20), so it covers the form's surroundings only.
     */
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
    },
    /**
     * The same job for taps that land *on* the card — a label, the padding
     * between fields. It has to be a child of the card rather than a second
     * sibling above it: a subview can never paint above a sibling of its
     * parent, so a backdrop outranking the card outranks everything in it,
     * open menu included, and the menu stops taking taps at all.
     *
     * Inside, the card's own layering does the work: 25 covers the groups that
     * merely hold a trigger (pickerRow, 20) while the group whose picker is
     * open (openPickerRow, 30) stays above it, keeping that trigger and its
     * menu live.
     *
     * Not a Pressable wrapped around the card, which is the other obvious way
     * to reach the dead space — that puts a touch responder over every field,
     * and TimeWheelPicker is a snapping ScrollView, so the wheels stop
     * scrolling. Taps survive it (a Touchable child claims the responder
     * first), which makes it look as though only the wheels are broken.
     *
     * Nothing is covered while an in-flow picker is open: this renders only for
     * the floating ones. See FLOATING_PICKERS.
     */
    cardBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 25,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    dayCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleActive: {
      backgroundColor: C.control,
      borderColor: C.control,
    },
    dayCircleText: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textSecondary,
    },
    dayCircleTextActive: {
      color: C.white,
    },
    errorBanner: { fontSize: 13, color: C.danger, textAlign: 'center', paddingVertical: 8, backgroundColor: C.danger + '12' },
  });
}
