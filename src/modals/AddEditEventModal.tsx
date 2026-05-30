import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, EventColors, EventTypeLabels, EventTypeConfig } from '../constants/colors';
import { CalendarEvent, EventStatus, TRACKABLE_TYPES } from '../utils/eventUtils';
import { addMinutesToTimeString } from '../utils/dateUtils';
import { AppSettings } from '../hooks/useSettings';
import { format, addDays } from 'date-fns';

const STATUS_OPTIONS: { value: EventStatus; label: string; icon: string; color: string }[] = [
  { value: 'pending',   label: 'Pending',   icon: 'alert-circle',    color: '#F39C12' },
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
  onDelete?: (id: string) => void;
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
TIME_OPTIONS.push('12:00 AM'); // midnight end-of-day option

function getMonthGrid(month: Date, weekStart: 'monday' | 'sunday'): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const weekStartsOn = weekStart === 'monday' ? 1 : 0;
  let startDow = firstDay.getDay();
  if (weekStartsOn === 1) startDow = (startDow + 6) % 7;
  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let d = 0; d < daysInMonth; d++) cells.push(addDays(firstDay, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function resolvedColor(type: string, settings: AppSettings): string {
  return settings.eventTypeColors[type] ?? EventColors[type] ?? Colors.accent;
}

function resolvedDefaultMinutes(type: string, settings: AppSettings): number {
  const config = EventTypeConfig[type];
  if (config?.defaultMinutes === 0) return 15; // fixed block
  return settings.eventTypeDefaultMinutes[type] ?? config?.defaultMinutes ?? 30;
}

function isFixedType(type: string): boolean {
  return EventTypeConfig[type]?.defaultMinutes === 0;
}

export function AddEditEventModal({ visible, event, defaultDate, defaultStartTime, settings, currentStatus, onStatusChange, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('scripture');
  const [localStatus, setLocalStatus] = useState<EventStatus | undefined>(currentStatus);
  const [date, setDate] = useState(defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('9:00 AM');
  const [endTime, setEndTime] = useState('9:30 AM');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [recurringRule, setRecurringRule] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [isBackup, setIsBackup] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
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
      setRecurring(event.recurring);
      setRecurringRule(event.recurringRule ?? 'weekly');
      setIsBackup(event.backup ?? false);
    } else {
      const initialStart = defaultStartTime ?? '9:00 AM';
      setTitle('');
      setType('scripture');
      setDate(defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
      setStartTime(initialStart);
      setEndTime(addMinutesToTimeString(initialStart, resolvedDefaultMinutes('scripture', settings)));
      setNotes('');
      setRecurring(false);
      setRecurringRule('weekly');
      setIsBackup(false);
    }
    setLocalStatus(currentStatus);
    setError('');
    setShowDatePicker(false);
    const initialDateStr = event ? event.date : (defaultDate ?? format(new Date(), 'yyyy-MM-dd'));
    const [py, pm] = initialDateStr.split('-').map(Number);
    setPickerMonth(new Date(py, pm - 1, 1));
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

  function handleTypeChange(newType: string) {
    setType(newType);
    if (!title) setTitle(EventTypeLabels[newType] ?? '');
    setEndTime(addMinutesToTimeString(startTime, resolvedDefaultMinutes(newType, settings)));
    setShowTypePicker(false);
  }

  function handleStartTimeChange(t: string) {
    setStartTime(t);
    setEndTime(addMinutesToTimeString(t, resolvedDefaultMinutes(type, settings)));
    setShowStartPicker(false);
  }

  async function handleSave() {
    setError('');
    const computedEnd = isFixedType(type)
      ? addMinutesToTimeString(startTime, 15)
      : endTime;
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
        backup: isBackup,
      });
      onClose();
    } catch (e) {
      console.error('[AddEditEventModal] onSave failed:', e);
      setError('Failed to save event. Please try again.');
    }
  }

  const fixed = isFixedType(type);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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
        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          {/* Status (only when editing a non-backup trackable event type) */}
          {event && !isBackup && TRACKABLE_TYPES.has(type) && (
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

          {/* Title */}
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

          {/* Type + Date row */}
          <View style={styles.row}>
            <View style={[styles.section, { flex: 1, marginRight: 4 }]}>
              <Text style={styles.label}>Event Type</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowTypePicker(!showTypePicker)}>
                <View style={[styles.colorDot, { backgroundColor: resolvedColor(type, settings) }]} />
                <Text style={styles.pickerText}>{EventTypeLabels[type]}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
              </TouchableOpacity>
              {showTypePicker && (
                <View style={styles.dropdown}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
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
            <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowDatePicker(v => !v)}>
                <Text style={styles.pickerText}>{format(new Date(date + 'T12:00:00'), 'MMM d, yyyy')}</Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
          {showDatePicker && (
            <View style={styles.datePickerPanel}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={styles.pickerNavBtn}>
                  <Ionicons name="chevron-back" size={20} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.pickerMonthTitle}>{format(pickerMonth, 'MMMM yyyy')}</Text>
                <TouchableOpacity onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={styles.pickerNavBtn}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.pickerDayHeaders}>
                {(settings.weekStart === 'monday'
                  ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                  : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
                ).map(day => <Text key={day} style={styles.pickerDayHeader}>{day}</Text>)}
              </View>
              {getMonthGrid(pickerMonth, settings.weekStart).map((week, wi) => (
                <View key={wi} style={styles.pickerWeek}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={styles.pickerDayCell} />;
                    const ds = format(day, 'yyyy-MM-dd');
                    const isSelected = ds === date;
                    const isToday = ds === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <TouchableOpacity
                        key={di}
                        style={[styles.pickerDayCell, isSelected && styles.pickerDayCellSelected]}
                        onPress={() => { setDate(ds); setShowDatePicker(false); }}
                      >
                        <Text style={[
                          styles.pickerDayText,
                          isToday && !isSelected && styles.pickerDayTextToday,
                          isSelected && styles.pickerDayTextSelected,
                        ]}>
                          {format(day, 'd')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* Times */}
          <View style={styles.row}>
            <View style={[styles.section, { flex: 1, marginRight: 4 }]}>
              <Text style={styles.label}>Start Time</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowStartPicker(!showStartPicker)}>
                <Text style={styles.pickerText}>{startTime}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
              </TouchableOpacity>
              {showStartPicker && (
                <View style={styles.dropdown}>
                  <ScrollView ref={startScrollRef} style={{ maxHeight: 180 }} nestedScrollEnabled>
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

            {!fixed && (
              <View style={[styles.section, { flex: 1, marginLeft: 4 }]}>
                <Text style={styles.label}>End Time</Text>
                <TouchableOpacity style={styles.picker} onPress={() => setShowEndPicker(!showEndPicker)}>
                  <Text style={styles.pickerText}>{endTime}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
                </TouchableOpacity>
                {showEndPicker && (
                  <View style={styles.dropdown}>
                    <ScrollView ref={endScrollRef} style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {TIME_OPTIONS.map((t, i) => (
                        <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => { setEndTime(t); setShowEndPicker(false); }}>
                          <Text style={styles.dropdownText}>{t}</Text>
                          {endTime === t && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes (optional)</Text>
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

          {/* Recurring */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Recurring</Text>
              <Switch
                value={recurring}
                onValueChange={setRecurring}
                trackColor={{ true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
            {recurring && (
              <View style={styles.ruleRow}>
                {(['daily', 'weekly', 'monthly'] as const).map(rule => (
                  <TouchableOpacity
                    key={rule}
                    style={[styles.ruleChip, recurringRule === rule && styles.ruleChipActive]}
                    onPress={() => setRecurringRule(rule)}
                  >
                    <Text style={[styles.ruleText, recurringRule === rule && styles.ruleTextActive]}>
                      {rule.charAt(0).toUpperCase() + rule.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Backup */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>Backup Event</Text>
                <Text style={styles.switchHint}>No status tracking, shown rightmost when overlapping</Text>
              </View>
              <Switch
                value={isBackup}
                onValueChange={setIsBackup}
                trackColor={{ true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          {/* Delete */}
          {event && onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => { onDelete(event.id); onClose(); }}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              <Text style={styles.deleteText}>Delete Event</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  cancel: { fontSize: 16, color: Colors.textSecondary },
  save: { fontSize: 16, fontWeight: '600', color: Colors.accent },
  form: { flex: 1, backgroundColor: Colors.background },
  section: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
  },
  row: { flexDirection: 'row', marginHorizontal: 0 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    color: Colors.text,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: 4,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top', paddingTop: 4 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 8 },
  pickerText: { flex: 1, fontSize: 16, color: Colors.text },
  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dropdownText: { flex: 1, fontSize: 15, color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchHint: { fontSize: 11, color: Colors.textLight, marginTop: 2, maxWidth: 220 },
  ruleRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  ruleChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ruleChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '20' },
  ruleText: { fontSize: 13, color: Colors.textSecondary },
  ruleTextActive: { color: Colors.accent, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.danger + '12',
  },
  deleteText: { fontSize: 15, fontWeight: '600', color: Colors.danger },
  errorBanner: { fontSize: 13, color: Colors.danger, textAlign: 'center', paddingVertical: 8, backgroundColor: Colors.danger + '12' },
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
  datePickerPanel: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 8,
    backgroundColor: Colors.white,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pickerNavBtn: { padding: 6 },
  pickerMonthTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  pickerDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  pickerDayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: Colors.textLight },
  pickerWeek: { flexDirection: 'row' },
  pickerDayCell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  pickerDayCellSelected: { backgroundColor: Colors.primary, borderRadius: 18 },
  pickerDayText: { fontSize: 13, color: Colors.text },
  pickerDayTextToday: { color: Colors.primary, fontWeight: '700' },
  pickerDayTextSelected: { color: Colors.white, fontWeight: '700' },
});
