import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels, EventTypeConfig } from '../constants/colors';
import {
  CalendarEvent, EventStatus, RecurringRule, defaultRecurrenceEnd,
  isCheckboxType, hasOptionalEnd, resolveEventStatus,
} from '../utils/eventUtils';
import {
  CONTACT_METHODS, contactMethodLabel, methodFieldLabel,
  methodOptionsFor, resolveContactMethod, usesContactMethod,
} from '../constants/contactMethods';
import { InlineDatePicker } from '../components/InlineDatePicker';
import { DropdownMenu, DropdownItem, Collapsible, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { EventDetailView } from '../components/EventDetailView';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { addMinutesToTimeString, parseTimeString } from '../utils/dateUtils';
import { AppSettings } from '../hooks/useSettings';
import { usePeople, Person } from '../hooks/usePeople';
import { PERSON_STATUSES, StatusConfig } from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { PersonPickerModal } from './PersonPickerModal';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';
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
  onSave: (event: Omit<CalendarEvent, 'id'>) => Promise<void>;
  /** 'single' drops just occurrenceDate; 'future' ends the series before it. */
  onDelete?: (id: string, occurrenceDate: string, mode: 'single' | 'future') => void;
  onClose: () => void;
}

const EVENT_TYPES = Object.keys(EventColors);

// Ends on half a row rather than a whole one, so a list longer than this says so
// by being visibly cut. Read off MENU_ITEM_HEIGHT rather than written as a number:
// the open-picker effect scrolls by idx * MENU_ITEM_HEIGHT to land the selected
// row at the top, and any drift from the real row height compounds with idx,
// walking that row further off the top the deeper it sits in the list.
const TYPE_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 4.5;

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

// Single-letter labels indexed by JS weekday (0 = Sunday … 6 = Saturday).
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  const { people: allPeople } = usePeople();

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
  const resolvedStatus = event ? resolveEventStatus(event, currentStatus) : undefined;

  const [title, setTitle] = useState('');
  const [type, setType] = useState('scripture');
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
  /**
   * An event that already exists opens as a page about itself; only editing it
   * shows the form. A new one has nothing to display, so it starts in the form
   * and never returns here — Cancel and Save both close it outright.
   */
  const [mode, setMode] = useState<'view' | 'edit'>(event ? 'view' : 'edit');
  const [error, setError] = useState('');
  const typeScrollRef = useRef<ScrollView>(null);
  const typeScrollEdges = useScrollEdges();

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
    } else {
      const initialType = prefill?.type ?? 'scripture';
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

  useEffect(() => {
    if (showTypePicker) {
      const idx = EVENT_TYPES.findIndex(t => t === type);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          typeScrollRef.current?.scrollTo({ y: idx * MENU_ITEM_HEIGHT, animated: false });
        });
      }
    }
  }, [showTypePicker]);

  // Reporting happens on the display view now. Both controls there hand back the
  // status they resolve to, including undefined when the active one is tapped
  // again, so this just adopts it and passes it on.
  function handleStatusTap(next: EventStatus | undefined) {
    setLocalStatus(next);
    onStatusChange?.(next);
  }

  function handleTypeChange(newType: string) {
    setType(newType);
    if (!title) setTitle(EventTypeLabels[newType] ?? '');
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
        'Delete Event',
        'Are you sure you want to delete this event?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { onDelete(event.id, event.date, 'single'); onClose(); },
          },
        ],
        { cancelable: true }
      );
      return;
    }
    Alert.alert(
      'Delete Recurring Event',
      'This event is recurring. What would you like to delete?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'This event only',
          style: 'destructive',
          onPress: () => { onDelete(event.id, event.date, 'single'); onClose(); },
        },
        {
          text: 'This and all future',
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
      title: title.trim() || (EventTypeLabels[type] ?? type),
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
    };
  }

  async function handleSave() {
    setError('');
    try {
      await onSave(buildEventData());
      // Otherwise a picker left open (Start Time, End Time) is still open
      // underneath when Edit reopens the form, since switching to 'view'
      // doesn't tear the form down.
      closePickers();
      // An existing event has a page to go back to; a new one does not.
      if (event) setMode('view'); else onClose();
    } catch (e) {
      console.error('[AddEditEventModal] onSave failed:', e);
      setError('Failed to save event. Please try again.');
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
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Event</Text>
              <TouchableOpacity onPress={() => setMode('edit')} style={styles.headerRightBtn}>
                <Text style={styles.save}>Edit</Text>
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
                accessibilityLabel={event ? 'Back' : 'Close'}
              >
                {event
                  ? <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
                  : <Ionicons name="close" size={22} color={Colors.textSecondary} />}
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{event ? 'Edit Event' : 'New Event'}</Text>
              <TouchableOpacity onPress={handleSave} style={styles.headerRightBtn}>
                <Text style={styles.save}>Save</Text>
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
            <Text style={styles.label}>Name</Text>
            <View style={styles.titleRow}>
              <TextInput
                style={[styles.input, styles.titleInput]}
                value={title}
                onChangeText={setTitle}
                onFocus={closePickers}
                placeholder={EventTypeLabels[type] ?? 'Event title'}
                placeholderTextColor={Colors.textLight}
              />
              {event && onDelete && (
                <TouchableOpacity
                  onPress={handleDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete event"
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.group, styles.columns, styles.pickerRow, elevatedPicker === 'type' && styles.openPickerRow]}>
            <View style={styles.column}>
              <Text style={styles.label}>Event Type</Text>
              <View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('type')}>
                  <View style={[styles.colorDot, { backgroundColor: resolvedColor(type, settings) }]} />
                  <Text style={styles.pickerText}>{EventTypeLabels[type]}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                <DropdownMenu open={showTypePicker}>
                  <ScrollView
                    ref={typeScrollRef}
                    style={{ maxHeight: TYPE_LIST_MAX_HEIGHT }}
                    nestedScrollEnabled
                    bounces={false}
                    overScrollMode="never"
                    {...typeScrollEdges.scrollViewProps}
                  >
                    {EVENT_TYPES.map((t, i) => (
                      <DropdownItem
                        key={t}
                        label={EventTypeLabels[t]}
                        selected={type === t}
                        showSeparator={i < EVENT_TYPES.length - 1}
                        leading={<View style={[styles.colorDot, { backgroundColor: resolvedColor(t, settings) }]} />}
                        onPress={() => handleTypeChange(t)}
                      />
                    ))}
                  </ScrollView>
                  {/* menuSurface, not card — the menu no longer sits on the card's
                      colour, so fading to `card` would leave a visible band. */}
                  <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={typeScrollEdges.showTopFade} />
                  <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={typeScrollEdges.showBottomFade} />
                </DropdownMenu>
              </View>
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.picker} onPress={() => togglePicker('date')}>
                <Text style={styles.pickerText}>{format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
          {/* A group of its own rather than a panel hanging off the row: it
              belongs to the Date field above it, and reads that way sitting
              directly beneath it inside the same card. */}
          {/* Deliberately not wrapped in Collapsible, unlike the time wheels
              below. Animating this one cost it taps that used to land — and the
              zIndex lift it needs is what a Collapsible's own wrapper gets in
              the way of. Left as it was: mounted only while open, lifted over
              its neighbours, no animation. */}
          {showDatePicker && (
            <View style={[styles.group, { paddingTop: 4 }, styles.openPickerRow]}>
              <InlineDatePicker
                value={date}
                weekStart={settings.weekStart}
                onChange={ds => { setDate(ds); closePickers(); }}
              />
            </View>
          )}

          <View style={[styles.group, styles.columns, styles.pickerRow, (elevatedPicker === 'start' || elevatedPicker === 'end') && styles.openPickerRow]}>
            <View style={styles.column}>
              <Text style={styles.label}>Start Time</Text>
              <TouchableOpacity style={styles.picker} onPress={() => togglePicker('start')}>
                <Text style={styles.pickerText}>{startTime}</Text>
                <Ionicons name={showStartPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>

            {!fixed && endOmitted && (
              <View style={styles.column}>
                <Text style={styles.label}>End Time</Text>
                <TouchableOpacity style={styles.picker} onPress={addEndTime}>
                  <Ionicons name="add-circle-outline" size={16} color={Colors.control} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerText, styles.pickerActionText]}>Add end time</Text>
                </TouchableOpacity>
              </View>
            )}

            {!fixed && !endOmitted && (
              <View style={styles.column}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>End Time</Text>
                  {hasOptionalEnd(type) && (
                    <TouchableOpacity
                      onPress={removeEndTime}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove end time"
                    >
                      <Ionicons name="close" size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('end')}>
                  <Text style={styles.pickerText}>{endTime}</Text>
                  <Ionicons name={showEndPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Which time it is editing reads off `elevatedPicker`, not
              `showStartPicker`: the latter is already false for the whole
              collapse, so the wheel would flip to the end time and animate away
              showing the wrong number. elevatedPicker holds the last one opened. */}
          <Collapsible open={showStartPicker || showEndPicker}>
            <View style={[styles.group, { paddingTop: 4 }]}>
              <TimeWheelPicker
                value={elevatedPicker === 'start' ? startTime : endTime}
                onChange={elevatedPicker === 'start' ? handleStartTimeChange : setEndTime}
              />
            </View>
          </Collapsible>

          {/* Half a row, with the other half left empty: the value is a short
              label off a fixed list, and stretching it the full width made it
              read as a longer field than it is. */}
          {usesContactMethod(type) && (
            <View style={[styles.group, styles.columns, styles.pickerRow, elevatedPicker === 'method' && styles.openPickerRow]}>
              <View style={styles.column}>
                <Text style={styles.label}>{methodFieldLabel(type)}</Text>
                <View>
                  <TouchableOpacity style={styles.picker} onPress={() => togglePicker('method')}>
                    <GoalIcon
                      icon={CONTACT_METHODS[contactMethod].icon}
                      iconFamily={CONTACT_METHODS[contactMethod].iconFamily}
                      size={16}
                      color={Colors.textSecondary}
                    />
                    <Text style={[styles.pickerText, { marginLeft: 8 }]}>{contactMethodLabel(contactMethod)}</Text>
                    <Ionicons name={showMethodPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                  <DropdownMenu open={showMethodPicker}>
                    {methodOptionsFor(type).map((m, i, arr) => (
                      <DropdownItem
                        key={m}
                        label={CONTACT_METHODS[m].label}
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
            <Text style={styles.label}>People</Text>
            {/* Nothing at all when no one is on the event. The label says what
                the group is and the link below says what to do about it; a line
                of prose between them only repeated that the list was empty. */}
            {attendees.length > 0 && (
              <View>
                {attendees.map((id, i) => {
                  const attendee = peopleById.get(id);
                  return (
                    <View key={id} style={[styles.personRow, i === 0 && styles.personRowFirst]}>
                      <StatusIcon config={statusConfigOf(attendee)} size={18} style={styles.personIcon} />
                      {/* A person deleted (or not yet synced) still has an id on the
                          event; showing the gap is better than dropping them silently. */}
                      <Text style={styles.personName} numberOfLines={1}>
                        {attendee?.name ?? 'Unknown person'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => { closePickers(); toggleAttendee(id); }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${attendee?.name ?? 'this person'}`}
                      >
                        <Ionicons name="close" size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
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
              <Ionicons name="add" size={18} color={Colors.goalTextAction} />
              <Text style={styles.addPersonText}>Add Person</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.group]}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              onFocus={closePickers}
              placeholder="Add notes..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={[styles.group, styles.pickerRow, (elevatedPicker === 'rule' || elevatedPicker === 'endsOn') && styles.openPickerRow]}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Recurring</Text>
              <Switch
                value={recurring}
                onValueChange={handleRecurringToggle}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {recurring && (
              <>
                <View style={[styles.columns, { marginTop: 12 }, elevatedPicker === 'rule' && styles.openPickerRow]}>
                  <View style={styles.column}>
                    <Text style={styles.label}>Frequency</Text>
                    <View>
                      <TouchableOpacity style={styles.picker} onPress={() => togglePicker('rule')}>
                        <Text style={styles.pickerText}>
                          {recurringRule.charAt(0).toUpperCase() + recurringRule.slice(1)}
                        </Text>
                        <Ionicons name={showRulePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                      <DropdownMenu open={showRulePicker}>
                        {(['daily', 'weekly', 'monthly'] as const).map((rule, i, arr) => (
                          <DropdownItem
                            key={rule}
                            label={rule.charAt(0).toUpperCase() + rule.slice(1)}
                            selected={recurringRule === rule}
                            showSeparator={i < arr.length - 1}
                            onPress={() => { changeRule(rule); closePickers(); }}
                          />
                        ))}
                      </DropdownMenu>
                    </View>
                  </View>

                  <View style={styles.column}>
                    <Text style={styles.label}>Ends</Text>
                    <TouchableOpacity style={styles.picker} onPress={() => togglePicker('endsOn')}>
                      <Text style={styles.pickerText}>
                        {format(new Date(endsOn + 'T12:00:00'), 'MMM d, yyyy')}
                      </Text>
                      <Ionicons name={showEndsOnPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Collapsible open={showEndsOnPicker}>
                  <InlineDatePicker
                    value={endsOn}
                    weekStart={settings.weekStart}
                    minDate={date}
                    onChange={ds => { setEndsOn(ds); closePickers(); }}
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
                            {DAY_LETTERS[day]}
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
            <View style={styles.switchRow}>
              <Text style={styles.label}>Backup Event</Text>
              <Switch
                value={isBackup}
                // Sits above the dismiss backdrop now that the card does, so it
                // closes any open dropdown itself — the same reason the Recurring
                // switch above it does.
                onValueChange={v => { closePickers(); setIsBackup(v); }}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
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
    // The display header's ×-and-Edit pair, sized the way WeeklyPlanningModal
    // sizes its close button: equal 60pt slots on both ends so the title sits
    // centred whatever the right-hand label says.
    closeBtn: { width: 60, alignItems: 'flex-start' },
    headerRightBtn: { width: 60, alignItems: 'flex-end' },
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
      // should read as the same card gaining fields, not as a new screen.
      marginTop: 18,
      borderRadius: 12,
      zIndex: 20,
    },
    // No rule between groups: the form is already full of hairlines under the
    // fields themselves, and a second kind of line reads as another one of those
    // rather than as a division. The labels carry the separation instead.
    group: { padding: 12 },
    // Two fields sharing a group's width — type and date, start and end.
    columns: { flexDirection: 'row', gap: 8 },
    column: { flex: 1 },
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
    input: {
      fontSize: 16,
      color: C.text,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      paddingVertical: 4,
    },
    notesInput: { minHeight: 56, textAlignVertical: 'top', paddingTop: 4 },
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    personRowFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    personIcon: { marginRight: 10 },
    personName: { flex: 1, fontSize: 15, color: C.text },
    // Matches WeeklyPlanningModal's "Add a Goal" — the same centred ＋-and-label
    // link, since both open something rather than committing anything.
    addPersonBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      // Shrunk to its own width and left-aligned, so it starts on the same edge
      // as the PEOPLE label and the names above it, and the tap target is the
      // link rather than the full width of the card.
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 8,
      paddingVertical: 6,
    },
    addPersonText: { fontSize: 14, fontWeight: '700', color: C.goalTextAction },
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
