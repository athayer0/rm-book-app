import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';
import { PERSON_STATUSES, STATUS_OPTIONS, statusDisplayName } from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  person?: Person | null;
  onSave: (person: Omit<Person, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function AddEditPersonModal({ visible, person, onSave, onDelete, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [name, setName] = useState('');
  const [status, setStatus] = useState('Other');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [starred, setStarred] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setStatus(person.status);
      setPhone(person.phone ?? '');
      setNotes(person.notes ?? '');
      setStarred(person.starred);
    } else {
      setName('');
      setStatus('Other');
      setPhone('');
      setNotes('');
      setStarred(false);
    }
  }, [person, visible]);

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), status, phone: phone.trim(), notes: notes.trim(), starred });
    onClose();
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{person ? 'Edit Person' : 'Add Person'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.save}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets bounces={false} overScrollMode="never">
          <View style={styles.section}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Status</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setShowStatusPicker(!showStatusPicker)}>
              {PERSON_STATUSES[status] && (
                <StatusIcon config={PERSON_STATUSES[status]} size={14} style={{ marginRight: 6 }} />
              )}
              <Text style={styles.pickerText}>{statusDisplayName(status)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
            </TouchableOpacity>
            {showStatusPicker && (
              <View style={styles.dropdown}>
                {STATUS_OPTIONS.map(s => {
                  const cfg = PERSON_STATUSES[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      style={styles.dropdownItem}
                      onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                    >
                      <StatusIcon config={cfg} size={14} style={{ marginRight: 8 }} />
                      <Text style={styles.dropdownText}>{statusDisplayName(s)}</Text>
                      {status === s && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.starRow} onPress={() => setStarred(!starred)}>
              <Ionicons
                name={starred ? 'star' : 'star-outline'}
                size={20}
                color={starred ? '#E8980E' : Colors.textLight}
              />
              <Text style={styles.starText}>
                {starred ? 'Favorited' : 'Mark as favorite'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes about this person..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
            />
          </View>

          {person && onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => { onDelete(person.id); onClose(); }}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              <Text style={styles.deleteText}>Delete Person</Text>
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
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: C.text,
    },
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
    notesInput: {
      minHeight: 56,
      textAlignVertical: 'top',
      paddingTop: 4,
    },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    pickerText: { flex: 1, fontSize: 16, color: C.text },
    dropdown: {
      marginTop: 4,
      backgroundColor: C.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
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
    starRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    starText: {
      fontSize: 15,
      color: C.textSecondary,
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
    deleteText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.danger,
    },
  });
}
