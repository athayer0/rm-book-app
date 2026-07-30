import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';
import { PERSON_STATUSES, STATUS_OPTIONS, statusDisplayName } from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { SheetModal } from '../components/SheetModal';
import { useSettings } from '../hooks/useSettings';
import {
  callNumber, isFacebookShareLink, messageNumber, openMessenger, openWhatsApp,
  toDialable, toMessengerHandle,
} from '../utils/phoneUtils';

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
  // null means the section is not on this person. '' means it is, but empty.
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [messenger, setMessenger] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [starred, setStarred] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setStatus(person.status);
      setPhone(person.phone ?? '');
      setWhatsapp(person.whatsapp ?? null);
      setMessenger(person.messenger ?? null);
      setNotes(person.notes ?? '');
      setStarred(person.starred);
    } else {
      setName('');
      setStatus('Other');
      setPhone('');
      setWhatsapp(null);
      setMessenger(null);
      setNotes('');
      setStarred(false);
    }
    setShowMethodPicker(false);
  }, [person, visible]);

  const { settings } = useSettings();
  const dialable = toDialable(phone);
  const whatsappDialable = toDialable(whatsapp);
  const messengerHandle = toMessengerHandle(messenger);

  const methodOptions = [
    {
      key: 'whatsapp' as const,
      label: 'WhatsApp',
      present: whatsapp !== null,
      // Seeded from the phone field at the moment it's added, then left alone —
      // later edits to the phone number do not follow, so the two can differ.
      add: () => setWhatsapp(phone.trim()),
    },
    {
      key: 'messenger' as const,
      label: 'Messenger',
      present: messenger !== null,
      add: () => setMessenger(''),
    },
  ];
  const availableMethods = methodOptions.filter(m => !m.present);

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      status,
      phone: phone.trim(),
      // undefined, not '', for a removed section: toRow maps it to a null column,
      // so the removal reaches the other devices instead of leaving a blank behind.
      whatsapp: whatsapp === null ? undefined : whatsapp.trim(),
      messenger: messenger === null ? undefined : messenger.trim(),
      notes: notes.trim(),
      starred,
    });
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
          {showMethodPicker && (
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowMethodPicker(false)} />
          )}
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

          <View style={[styles.section, styles.pickerRow]}>
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
            <View style={styles.phoneRow}>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
              {dialable.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => messageNumber(phone)}
                    accessibilityRole="button"
                    accessibilityLabel={name.trim() ? `Message ${name.trim()}` : 'Message this number'}
                  >
                    <Ionicons name="chatbubble" size={17} color={Colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => callNumber(phone)}
                    accessibilityRole="button"
                    accessibilityLabel={name.trim() ? `Call ${name.trim()}` : 'Call this number'}
                  >
                    <Ionicons name="call" size={18} color={Colors.accent} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {whatsapp !== null && (
            <View style={styles.section}>
              <View style={styles.methodHeader}>
                <Text style={styles.label}>WhatsApp</Text>
                <TouchableOpacity
                  onPress={() => setWhatsapp(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove WhatsApp"
                >
                  <Ionicons name="close" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
              <View style={styles.phoneRow}>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  placeholder="WhatsApp number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                />
                {whatsappDialable.length > 0 && (
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => openWhatsApp(whatsapp, settings.defaultCountryCode)}
                    accessibilityRole="button"
                    accessibilityLabel={name.trim() ? `WhatsApp ${name.trim()}` : 'Open in WhatsApp'}
                  >
                    <MaterialCommunityIcons name="whatsapp" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {messenger !== null && (
            <View style={styles.section}>
              <View style={styles.methodHeader}>
                <Text style={styles.label}>Messenger</Text>
                <TouchableOpacity
                  onPress={() => setMessenger(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove Messenger"
                >
                  <Ionicons name="close" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
              <View style={styles.phoneRow}>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={messenger}
                  onChangeText={setMessenger}
                  placeholder="Profile link or username"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {messengerHandle.length > 0 && (
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => openMessenger(messenger)}
                    accessibilityRole="button"
                    accessibilityLabel={name.trim() ? `Message ${name.trim()} on Messenger` : 'Open in Messenger'}
                  >
                    <MaterialCommunityIcons name="facebook-messenger" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
              {messengerHandle.length > 0 && !/^\d+$/.test(messengerHandle) && (
                <Text style={styles.fieldHint}>
                  Opens through m.me, which may bounce via the browser. Saving their
                  profile.php?id=… link instead jumps straight into Messenger.
                </Text>
              )}
              {messenger.trim().length > 0 && messengerHandle.length === 0 && (
                <Text style={styles.fieldHint}>
                  {isFacebookShareLink(messenger)
                    ? 'That’s a share link — only Facebook can expand it. Open it in a browser, then copy the facebook.com/… address it lands on.'
                    : 'Couldn’t read a profile out of that. Paste their facebook.com or m.me link, or just their username.'}
                </Text>
              )}
            </View>
          )}

          {availableMethods.length > 0 && (
            <View style={[
              styles.section,
              styles.pickerRow,
              showMethodPicker && styles.openPickerRow,
            ]}>
              {/* Trigger and dropdown share a wrapper so the dropdown hangs off the
                  row itself, not the section's padding box — same as the time
                  pickers in AddEditEventModal. */}
              <View>
                <TouchableOpacity
                  style={styles.addMethodRow}
                  onPress={() => setShowMethodPicker(v => !v)}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
                  <Text style={styles.addMethodText}>Add contact method</Text>
                  <Ionicons
                    name={showMethodPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textLight}
                  />
                </TouchableOpacity>
                {showMethodPicker && (
                  <View style={[styles.dropdown, styles.dropdownFloating]}>
                    {availableMethods.map(method => (
                      <TouchableOpacity
                        key={method.key}
                        style={styles.dropdownItem}
                        onPress={() => { method.add(); setShowMethodPicker(false); }}
                      >
                        <MaterialCommunityIcons
                          name={method.key === 'whatsapp' ? 'whatsapp' : 'facebook-messenger'}
                          size={18}
                          color={Colors.accent}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.dropdownText}>{method.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

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
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    phoneInput: {
      flex: 1,
    },
    fieldHint: {
      fontSize: 12,
      color: C.textLight,
      marginTop: 8,
    },
    // The label inside already carries the 8pt gap the other sections use.
    methodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    addMethodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addMethodText: {
      flex: 1,
      fontSize: 15,
      color: C.accent,
      fontWeight: '500',
    },
    contactBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.contactActionBg,
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
    // Layers, low to high: plain form content (auto) < backdrop (10) < any row
    // holding a picker trigger (20) < the row whose picker is open (30). Keeping
    // triggers above the backdrop is what lets one tap move between pickers
    // instead of only dismissing. zIndex only — elevation would paint an Android
    // shadow onto the card rows themselves.
    pickerRow: { zIndex: 20 },
    openPickerRow: { zIndex: 30 },
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
