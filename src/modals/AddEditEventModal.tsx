import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels, EventTypeConfig } from '../constants/colors';
import { CalendarEvent, EventStatus, TRACKABLE_TYPES, RecurringRule, defaultRecurrenceEnd, isCheckboxType } from '../utils/eventUtils';
import { InlineDatePicker } from '../components/InlineDatePicker';
import { StatusCheckbox } from '../components/StatusCheckbox';
import { SheetModal } from '../components/SheetModal';
import { addMinutesToTimeString } from '../utils/dateUtils';
import { AppSettings } from '../hooks/useSettings';
import { format } from 'date-fns';

const STATUS_OPTIONS: { value: EventStatus; label: string; icon: string; color: string }[] = [
  { value: 'pending',   label: 'Pending',   icon: 'alert-circle',    color: '#E8980E' },
  { value: 'completed', label: 'Completed', icon: 'checkmark-circle', color: '#1A7A40' },
  { value: 'failed',    label: 'Failed',    icon: 'ban',             color: '#B03030' },
];

interface Props {
  visible: boolean;
  event?: CalendarEvent | null;
  defaultDate?: string;
  defaultStartTime?: string;
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

// Checkbox events (task, prayer) have no duration, so they contribute no minutes; every
// other type falls back to its configured default. No type is treated as a 15-minute event.
function resolvedDefaultMinutes(type: string, settings: AppSettings): number {
  if (isCheckboxType(type)) return 0;
  return settings.eventTypeDefaultMinutes[type] ?? EventTypeConfig[type]?.defaultMinutes ?? 30;
}

// Single-letter labels indexed by JS weekday (0 = Sunday … 6 = Saturday).
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekdayOf(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

type PickerId = 'type' | 'date' | 'start' | 'end' | 'rule' | 'endsOn';

export function AddEditEventModal({ visible, event, defaultDate, defaultStartTime, settings, currentStatus, onStatusChange, onSave, onDelete, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('scripture');
  const [localStatus, setLocalStatus] = useState<EventStatus | undefined>(currentStatus);
  const [date, setDate] = useState(defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('9:00 AM');
  const [endTime, setEndTime] = useState('9:30 AM');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [recurringRule, setRecurringRule] = useState<RecurringRule>('weekly');
  const [endsOn, setEndsOn] = useState(() => defaultRecurrenceEnd(defaultDate ?? format(new Date(), 'yyyy-MM-dd'), 'weekly'));
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [isBackup, setIsBackup] = useState(false);
  // One picker open at a time — a single value makes that structural instead of
  // something six separate booleans have to agree on.
  const [openPicker, setOpenPicker] = useState<PickerId | null>(null);
  const showTypePicker = openPicker === 'type';
  const showDatePicker = openPicker === 'date';
  const showStartPicker = openPicker === 'start';
  const showEndPicker = openPicker === 'end';
  const showRulePicker = openPicker === 'rule';
  const showEndsOnPicker = openPicker === 'endsOn';
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
    } else {
      const initialStart = defaultStartTime ?? '9:00 AM';
      const initialDate = defaultDate ?? format(new Date(), 'yyyy-MM-dd');
      setTitle('');
      setType('scripture');
      setDate(initialDate);
      setStartTime(initialStart);
      setEndTime(addMinutesToTimeString(initialStart, resolvedDefaultMinutes('scripture', settings)));
      setNotes('');
      setRecurring(false);
      setRecurringRule('weekly');
      setEndsOn(defaultRecurrenceEnd(initialDate, 'weekly'));
      setRecurringDays([]);
      setIsBackup(false);
    }
    setOpenPicker(null);
    setLocalStatus(currentStatus);
    setError('');
  }, [event, defaultDate, defaultStartTime, visible, currentStatus]);

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

  function handleStatusTap(value: EventStatus) {
    const next = localStatus === value ? undefined : value;
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
    closePickers();
  }

  function handleStartTimeChange(t: string) {
    setStartTime(t);
    setEndTime(addMinutesToTimeString(t, resolvedDefaultMinutes(type, settings)));
    closePickers();
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
      });
      onClose();
    } catch (e) {
      console.error('[AddEditEventModal] onSave failed:', e);
      setError('Failed to save event. Please try again.');
    }
  }

  const fixed = isCheckboxType(type);
  const anyPickerOpen = openPicker !== null;

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
                  {localStatus ? STATUS_OPTIONS.find(o => o.value === localStatus)?.label : 'None'}
                </Text>
                <View style={styles.statusIcons}>
                  {STATUS_OPTIONS.map(opt => {
                    const selected = localStatus === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => handleStatusTap(opt.value)}
                        style={opt.icon === 'ban' ? { width: 51, height: 54, alignItems: 'center', justifyContent: 'center' } : undefined}
                      >
                        {opt.icon === 'ban' && selected ? (
                          <View style={{ width: 45, height: 45, borderRadius: 23, backgroundColor: opt.color, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="ban-outline" size={39} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
                          </View>
                        ) : (
                          <Ionicons
                            name={(selected ? opt.icon : opt.icon + '-outline') as any}
                            size={opt.icon === 'ban' ? 51 : 54}
                            color={opt.color}
                            style={opt.icon === 'ban' ? { transform: [{ scaleX: -1 }] } : undefined}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
                          {type === t && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
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
                          {startTime === t && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            {!fixed && (
              <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
                <Text style={styles.label}>End Time</Text>
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
                            {endTime === t && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

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
                trackColor={{ true: Colors.accent }}
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
                              {recurringRule === rule && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
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
                trackColor={{ true: Colors.accent }}
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
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 8 },
    pickerText: { flex: 1, fontSize: 16, color: C.text },
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
      backgroundColor: C.accent,
      borderColor: C.accent,
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
