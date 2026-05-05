import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Person } from '../hooks/usePeople';

interface Props {
  visible: boolean;
  person?: Person | null;
  onSave: (person: Omit<Person, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const STATUS_OPTIONS = ['Friend', 'Dating', 'Fellowship Contact', 'Family', 'Other'];

export function AddEditPersonModal({ visible, person, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Friend');
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
      setStatus('Friend');
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{person ? 'Edit Person' : 'Add Person'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.save}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
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
              <Text style={styles.pickerText}>{status}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textLight} />
            </TouchableOpacity>
            {showStatusPicker && (
              <View style={styles.dropdown}>
                {STATUS_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={styles.dropdownItem}
                    onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                  >
                    <Text style={styles.dropdownText}>{s}</Text>
                    {status === s && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Phone (optional)</Text>
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
            <Text style={styles.label}>Notes (optional)</Text>
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

          <View style={styles.section}>
            <TouchableOpacity style={styles.starRow} onPress={() => setStarred(!starred)}>
              <Ionicons
                name={starred ? 'star' : 'star-outline'}
                size={20}
                color={starred ? '#F39C12' : Colors.textLight}
              />
              <Text style={styles.starText}>
                {starred ? 'Favorited' : 'Mark as favorite'}
              </Text>
            </TouchableOpacity>
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
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
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 4,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
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
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  starText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
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
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.danger,
  },
});
