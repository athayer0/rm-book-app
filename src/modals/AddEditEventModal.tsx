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
  CalendarEvent, EventStatus, TRACKABLE_TYPES, RecurringRule, defaultRecurrenceEnd,
  isCheckboxType, hasOptionalEnd, resolveEventStatus,
} from '../utils/eventUtils';
import {
  CONTACT_METHODS, contactMethodLabel, methodFieldLabel,
  methodOptionsFor, resolveContactMethod, usesContactMethod,
} from '../constants/contactMethods';
import { InlineDatePicker } from '../components/InlineDatePicker';
import { StatusCheckbox } from '../components/StatusCheckbox';
import { StatusPicker, STATUS_LABELS } from '../components/StatusPicker';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { addMinutesToTimeString, parseTimeString } from '../utils/dateUtils';
import { AppSettings } from '../hooks/useSettings';
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
  onSave: (event: Omit<CalendarEvent, 'id'>) => Promise<void>;
  /** 'single' drops just occurrenceDate; 'future' ends the series before it. */
  onDelete?: (id: string, occurrenceDate: string, mode: 'single' | 'future') => void;
  onClose: () => void;
}

const EVENT_TYPES = Object.keys(EventColors);

const TIME_OPTIONS: string[] = [];
for (let h = 0; h <= 23; h++) {
  for (let m = 0; m < 60; m += 30) {
    const h12 = h % 12 || 12;
    const mm = String(m).padStart(2, '0');
    const ampm = h < 12 ? 'AM' : 'PM';
    TIME_OPTIONS.push(`${h12}:${mm} ${ampm}`);
  }
}
TIME_OPTIONS.push('12:00 AM');

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
  const [error, setError] = useState('');
  const startScrollRef = useRef<ScrollView>(null);
  const endScrollRef = useRef<ScrollView>(null);
  const DROPDOWN_ITEM_HEIGHT = 40;

  useEffect(() => {
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
    setLocalStatus(resolvedStatus);
    setError('');
    // resolvedStatus is read but deliberately not a dependency: it consults the
    // clock, so listing it would re-run this whole reset the minute an event's
    // start time passed with the sheet open — discarding any unsaved edits. Its
    // other inputs, `event` and `currentStatus`, are both listed, so it stays in
    // step with everything that can actually change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, defaultDate, defaultStartTime, prefill, visible, currentStatus]);

  useEffect(() => {
    if (showStartPicker) {
      const idx = TIME_OPTIONS.findIndex(t => t === startTime);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          startScrollRef.current?.scrollTo({ y: idx * DROPDOWN_ITEM_HEIGHT, animated: false });
        });
      }
    }
  }, [showStartPicker]);

  useEffect(() => {
    if (showEndPicker) {
      const idx = TIME_OPTIONS.findIndex(t => t === endTime);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          endScrollRef.current?.scrollTo({ y: idx * DROPDOWN_ITEM_HEIGHT, animated: false });
        });
      }
    }
  }, [showEndPicker]);

  // StatusPicker owns the tap-again-to-clear toggle, so this just adopts whatever
  // it resolves to.
  function handleStatusTap(next: EventStatus | undefined) {
    setLocalStatus(next);
    onStatusChange?.(next);
  }

  function handleCheckboxToggle() {
    const next: EventStatus | undefined = localStatus === 'completed' ? undefined : 'completed';
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
  function handleStartTimeChange(t: string) {
    const keepDuration = hasOptionalEnd(type) && endTime !== startTime;
    setStartTime(t);
    setEndTime(addMinutesToTimeString(
      t,
      keepDuration ? minutesBetween(startTime, endTime) : resolvedDefaultMinutes(type, settings),
    ));
    closePickers();
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
      onDelete(event.id, event.date, 'single');
      onClose();
      return;
    }
    Alert.alert(
      'Delete Recurring Event',
      'This event is recurring. What would you like to delete?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'This event only',
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

  async function handleSave() {
    setError('');
    // Checkbox events have only a start time; store the end equal to it (a 0-minute event).
    const computedEnd = isCheckboxType(type) ? startTime : endTime;
    try {
      await onSave({
        title: title.trim() || (EventTypeLabels[type] ?? type),
        type,
        color: resolvedColor(type, settings),
        date,
        startTime,
        endTime: computedEnd,
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
      });
      onClose();
    } catch (e) {
      console.error('[AddEditEventModal] onSave failed:', e);
      setError('Failed to save event. Please try again.');
    }
  }

  const fixed = isCheckboxType(type);
  const anyPickerOpen = openPicker !== null;
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

  function closePickers() {
    setOpenPicker(null);
  }

  function togglePicker(which: PickerId) {
    setOpenPicker(cur => (cur === which ? null : which));
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{event ? 'Edit Event' : 'New Event'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.save}>Save</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}
        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets bounces={false} overScrollMode="never">
          {anyPickerOpen && (
            <Pressable style={styles.pickerBackdrop} onPress={closePickers} />
          )}
          {event && !isBackup && isCheckboxType(type) && (
            <View style={styles.section}>
              <View style={styles.statusRow}>
                <Text style={[styles.label, { marginBottom: 0, paddingLeft: 6, fontSize: 16 }]}>
                  {localStatus === 'completed' ? 'Completed' : 'Not completed'}
                </Text>
                <TouchableOpacity onPress={handleCheckboxToggle} style={styles.statusIcons} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <StatusCheckbox checked={localStatus === 'completed'} size={40} color={resolvedColor(type, settings)} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {event && !isBackup && !isCheckboxType(type) && TRACKABLE_TYPES.has(type) && (
            <View style={styles.section}>
              <View style={styles.statusRow}>
                <Text style={[styles.label, { marginBottom: 0, paddingLeft: 6, fontSize: 16 }]}>
                  {localStatus ? STATUS_LABELS[localStatus] : 'None'}
                </Text>
                <StatusPicker value={localStatus} onChange={handleStatusTap} />
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={EventTypeLabels[type] ?? 'Event title'}
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={[styles.row, styles.pickerRow, showTypePicker && styles.openPickerRow]}>
            <View style={[styles.section, { flex: 1, marginRight: 4 }]}>
              <Text style={styles.label}>Event Type</Text>
              <View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('type')}>
                  <View style={[styles.colorDot, { backgroundColor: resolvedColor(type, settings) }]} />
                  <Text style={styles.pickerText}>{EventTypeLabels[type]}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                {showTypePicker && (
                  <View style={[styles.dropdown, styles.dropdownFloating]}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled bounces={false} overScrollMode="never">
                      {EVENT_TYPES.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={styles.dropdownItem}
                          onPress={() => handleTypeChange(t)}
                        >
                          <View style={[styles.colorDot, { backgroundColor: resolvedColor(t, settings) }]} />
                          <Text style={styles.dropdownText}>{EventTypeLabels[t]}</Text>
                          {type === t && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.picker} onPress={() => togglePicker('date')}>
                <Text style={styles.pickerText}>{format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
          {showDatePicker && (
            <View style={[styles.section, { paddingTop: 4 }, styles.openPickerRow]}>
              <InlineDatePicker
                value={date}
                weekStart={settings.weekStart}
                onChange={ds => { setDate(ds); closePickers(); }}
              />
            </View>
          )}

          <View style={[styles.row, styles.pickerRow, (showStartPicker || showEndPicker) && styles.openPickerRow]}>
            <View style={[styles.section, { flex: 1, marginRight: 4 }]}>
              <Text style={styles.label}>Start Time</Text>
              <View>
                <TouchableOpacity style={styles.picker} onPress={() => togglePicker('start')}>
                  <Text style={styles.pickerText}>{startTime}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                {showStartPicker && (
                  <View style={[styles.dropdown, styles.dropdownFloating]}>
                    <ScrollView ref={startScrollRef} style={{ maxHeight: 180 }} nestedScrollEnabled bounces={false} overScrollMode="never">
                      {TIME_OPTIONS.map((t, i) => (
                        <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => handleStartTimeChange(t)}>
                          <Text style={styles.dropdownText}>{t}</Text>
                          {startTime === t && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            {!fixed && endOmitted && (
              <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
                <Text style={styles.label}>End Time</Text>
                <TouchableOpacity style={styles.picker} onPress={addEndTime}>
                  <Ionicons name="add-circle-outline" size={16} color={Colors.control} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerText, styles.pickerActionText]}>Add end time</Text>
                </TouchableOpacity>
              </View>
            )}

            {!fixed && !endOmitted && (
              <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
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
                <View>
                  <TouchableOpacity style={styles.picker} onPress={() => togglePicker('end')}>
                    <Text style={styles.pickerText}>{endTime}</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                  {showEndPicker && (
                    <View style={[styles.dropdown, styles.dropdownFloating]}>
                      <ScrollView ref={endScrollRef} style={{ maxHeight: 180 }} nestedScrollEnabled bounces={false} overScrollMode="never">
                        {TIME_OPTIONS.map((t, i) => (
                          <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => { setEndTime(t); closePickers(); }}>
                            <Text style={styles.dropdownText}>{t}</Text>
                            {endTime === t && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {usesContactMethod(type) && (
            <View style={[styles.section, styles.pickerRow, showMethodPicker && styles.openPickerRow]}>
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
                {showMethodPicker && (
                  <View style={[styles.dropdown, styles.dropdownFloating]}>
                    {methodOptionsFor(type).map(m => (
                      <TouchableOpacity
                        key={m}
                        style={styles.dropdownItem}
                        onPress={() => { setContactMethod(m); closePickers(); }}
                      >
                        <GoalIcon
                          icon={CONTACT_METHODS[m].icon}
                          iconFamily={CONTACT_METHODS[m].iconFamily}
                          size={16}
                          color={Colors.textSecondary}
                        />
                        <Text style={[styles.dropdownText, { marginLeft: 8 }]}>{CONTACT_METHODS[m].label}</Text>
                        {contactMethod === m && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.label}>People</Text>
            {attendees.length === 0 ? (
              <Text style={styles.personEmpty}>No one added yet</Text>
            ) : (
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
                        onPress={() => toggleAttendee(id)}
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
          </View>

          {/* Outside the card, on the sheet's background — the same footing
              "Add a Goal" has under the goal list. */}
          <TouchableOpacity
            style={styles.addPersonBtn}
            onPress={() => { closePickers(); setShowPersonPicker(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color={Colors.goalTextAction} />
            <Text style={styles.addPersonText}>Add Person</Text>
          </TouchableOpacity>

          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={[styles.section, styles.pickerRow, (showRulePicker || showEndsOnPicker) && styles.openPickerRow]}>
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
                <View style={[styles.row, { marginTop: 12 }, showRulePicker && styles.openPickerRow]}>
                  <View style={{ flex: 1, marginRight: 4 }}>
                    <Text style={styles.label}>Frequency</Text>
                    <View>
                      <TouchableOpacity style={styles.picker} onPress={() => togglePicker('rule')}>
                        <Text style={styles.pickerText}>
                          {recurringRule.charAt(0).toUpperCase() + recurringRule.slice(1)}
                        </Text>
                        <Ionicons name={showRulePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                      {showRulePicker && (
                        <View style={[styles.dropdown, styles.dropdownFloating]}>
                          {(['daily', 'weekly', 'monthly'] as const).map(rule => (
                            <TouchableOpacity
                              key={rule}
                              style={styles.dropdownItem}
                              onPress={() => { changeRule(rule); closePickers(); }}
                            >
                              <Text style={styles.dropdownText}>
                                {rule.charAt(0).toUpperCase() + rule.slice(1)}
                              </Text>
                              {recurringRule === rule && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <Text style={styles.label}>Ends</Text>
                    <TouchableOpacity style={styles.picker} onPress={() => togglePicker('endsOn')}>
                      <Text style={styles.pickerText}>
                        {format(new Date(endsOn + 'T12:00:00'), 'MMM d, yyyy')}
                      </Text>
                      <Ionicons name={showEndsOnPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  </View>
                </View>

                {showEndsOnPicker && (
                  <InlineDatePicker
                    value={endsOn}
                    weekStart={settings.weekStart}
                    minDate={date}
                    onChange={ds => { setEndsOn(ds); closePickers(); }}
                  />
                )}

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

          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Backup Event</Text>
              <Switch
                value={isBackup}
                onValueChange={setIsBackup}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          {event && onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              <Text style={styles.deleteText}>Delete Event</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

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
    headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },
    cancel: { fontSize: 16, color: C.textSecondary },
    save: { fontSize: 16, fontWeight: '600', color: C.accent },
    form: { flex: 1, backgroundColor: C.background },
    section: {
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 12,
    },
    row: { flexDirection: 'row', marginHorizontal: 0 },
    // Layers, low to high: plain form content (auto) < backdrop (10) < any row holding a
    // picker trigger (20) < the row whose picker is open (30). Keeping every trigger above
    // the backdrop is what lets one tap switch dropdowns instead of just dismissing.
    // zIndex only, no elevation — elevation would paint an Android shadow on the card rows.
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
    personEmpty: { fontSize: 14, color: C.textLight, paddingVertical: 2 },
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
    // link sitting on the background below its card, since both open something
    // rather than committing anything.
    addPersonBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 4,
      paddingVertical: 10,
    },
    addPersonText: { fontSize: 14, fontWeight: '700', color: C.goalTextAction },
    dropdown: {
      marginTop: 4,
      backgroundColor: C.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
    },
    dropdownFloating: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: C.card,
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 12,
      zIndex: 21,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    dropdownText: { flex: 1, fontSize: 15, color: C.text },
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
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: C.danger + '12',
    },
    deleteText: { fontSize: 15, fontWeight: '600', color: C.danger },
    errorBanner: { fontSize: 13, color: C.danger, textAlign: 'center', paddingVertical: 8, backgroundColor: C.danger + '12' },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    statusIcons: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
  });
}
