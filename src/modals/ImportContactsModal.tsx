import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { usePeople } from '../hooks/usePeople';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface DeviceContact {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

function primaryPhone(numbers: Contacts.PhoneNumber[] | undefined): string | undefined {
  if (!numbers || numbers.length === 0) return undefined;
  return (numbers.find(n => n.isPrimary) ?? numbers[0]).number ?? undefined;
}

/** Street, city, state — the same shape the address field's own placeholder asks for. */
function primaryAddress(addresses: Contacts.Address[] | undefined): string | undefined {
  if (!addresses || addresses.length === 0) return undefined;
  const a = addresses[0];
  const parts = [a.street, a.city, a.region].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

type LoadState = 'loading' | 'denied' | 'error' | 'ready';

/**
 * Pulls names and numbers out of the phone's own contacts app, so someone
 * already tracked there doesn't have to be retyped by hand. Only offered here,
 * not folded into the FAB's quick-add stack — this asks for a system
 * permission and a device round trip, which the bubble menu never does.
 */
export function ImportContactsModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { people, addPerson } = usePeople();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  // 'limited' (iOS 18+ only) means the OS is only sharing a subset of contacts —
  // an empty or short list here doesn't mean the address book itself is empty.
  const [accessPrivileges, setAccessPrivileges] = useState<'all' | 'limited' | 'none' | undefined>();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const existingNames = useMemo(
    () => new Set(people.map(p => p.name.trim().toLowerCase())),
    [people],
  );

  async function loadContacts() {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Addresses],
      sort: Contacts.SortTypes.FirstName,
    });
    const withNames = data
      .filter(c => c.name && c.name.trim().length > 0)
      .map(c => ({
        id: c.id,
        name: c.name.trim(),
        phone: primaryPhone(c.phoneNumbers),
        address: primaryAddress(c.addresses),
      }));
    setContacts(withNames);
    setLoadState('ready');
  }

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelected(new Set());
    setLoadState('loading');
    (async () => {
      try {
        const { status, accessPrivileges: privileges } = await Contacts.requestPermissionsAsync();
        setAccessPrivileges(privileges);
        if (status !== 'granted') {
          setLoadState('denied');
          return;
        }
        await loadContacts();
      } catch {
        setLoadState('error');
      }
    })();
    // loadContacts only reads module-level APIs, not component state — safe to
    // leave out of the deps list here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The in-app picker (`Contacts.presentAccessPickerAsync`) needs iOS 18 native
  // code Expo Go doesn't reliably ship — it opened a blank sheet in testing
  // rather than the real picker. Settings is the one door that's actually open,
  // so that's the whole flow rather than a fallback tried after failing.
  function openContactsSettings() {
    Linking.openSettings();
  }

  const matches = useMemo(
    () => contacts
      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [contacts, search],
  );

  function toggle(contact: DeviceContact) {
    if (existingNames.has(contact.name.toLowerCase())) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(contact.id)) next.delete(contact.id); else next.add(contact.id);
      return next;
    });
  }

  async function handleImport() {
    const toAdd = contacts.filter(c => selected.has(c.id));
    if (toAdd.length === 0) { onClose(); return; }
    setImporting(true);
    for (const contact of toAdd) {
      await addPerson({
        name: contact.name,
        status: 'Other',
        phone: contact.phone ?? '',
        address: contact.address,
        notes: '',
      });
    }
    setImporting(false);
    onClose();
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>Import Contacts</Text>
          <Text style={styles.headerCount}>
            {selected.size === 0 ? 'None selected' : `${selected.size} selected`}
          </Text>
        </View>
        <TouchableOpacity onPress={handleImport} disabled={selected.size === 0 || importing}>
          <Text style={[styles.done, (selected.size === 0 || importing) && styles.doneDisabled]}>
            {importing ? 'Adding…' : 'Import'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loadState === 'ready' && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={Colors.textLight} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts..."
              placeholderTextColor={Colors.textLight}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loadState === 'loading' && (
          <View style={styles.empty}>
            <ActivityIndicator color={Colors.control} />
            <Text style={styles.emptyText}>Loading contacts…</Text>
          </View>
        )}

        {loadState === 'denied' && (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>Contacts access denied</Text>
            <Text style={styles.emptyText}>
              Allow contacts access in Settings to import people from your phone.
            </Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'error' && (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>Couldn't load contacts</Text>
            <Text style={styles.emptyText}>Something went wrong reading your contacts.</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => { setLoadState('loading'); loadContacts().catch(() => setLoadState('error')); }}
            >
              <Text style={styles.settingsBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'ready' && accessPrivileges === 'limited' && (
          <View style={styles.limitedBanner}>
            <View style={styles.limitedBannerIcon}>
              <Ionicons name="settings-outline" size={20} color={Colors.control} />
            </View>
            <Text style={styles.limitedBannerText} numberOfLines={1}>
              Only some contacts are shared.
            </Text>
            <TouchableOpacity style={styles.limitedBannerBtn} onPress={openContactsSettings}>
              <Text style={styles.limitedBannerBtnText}>Manage Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'ready' && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            {matches.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyTitle}>
                  {search.length > 0 ? 'No matches' : 'No contacts found'}
                </Text>
                {search.length === 0 && accessPrivileges === 'limited' && (
                  <>
                    <Text style={styles.emptyText}>
                      None of your contacts have been shared with this app yet.
                    </Text>
                    <TouchableOpacity style={styles.settingsBtn} onPress={openContactsSettings}>
                      <Text style={styles.settingsBtnText}>Open Settings</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              matches.map((contact, index) => {
                const alreadyAdded = existingNames.has(contact.name.toLowerCase());
                const isSelected = selected.has(contact.id);
                return (
                  <TouchableOpacity
                    key={contact.id}
                    style={[
                      styles.row,
                      index === 0 && styles.rowFirst,
                      alreadyAdded && styles.rowDisabled,
                    ]}
                    onPress={() => toggle(contact)}
                    disabled={alreadyAdded}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowName}>{contact.name}</Text>
                      {!!contact.phone && <Text style={styles.rowPhone}>{contact.phone}</Text>}
                      {!!contact.address && (
                        <Text style={styles.rowPhone} numberOfLines={1}>{contact.address}</Text>
                      )}
                    </View>
                    {alreadyAdded ? (
                      <Text style={styles.addedLabel}>Added</Text>
                    ) : (
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? Colors.control : Colors.textLight}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
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
    headerLabels: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
    headerCount: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    closeBtn: { width: 60, alignItems: 'flex-start' },
    done: { fontSize: 16, fontWeight: '600', color: C.accent },
    doneDisabled: { color: C.textLight },
    body: { flex: 1, backgroundColor: C.background },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },
    limitedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      gap: 8,
    },
    limitedBannerIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.control + '1a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    limitedBannerText: { flex: 1, fontSize: 12, color: C.textSecondary },
    limitedBannerBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: C.control,
    },
    limitedBannerBtnText: { fontSize: 12, fontWeight: '600', color: C.white },
    scroll: { flex: 1 },
    content: { paddingTop: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    rowFirst: { borderTopWidth: 0 },
    rowDisabled: { opacity: 0.55 },
    rowText: { flex: 1, marginRight: 12 },
    rowName: { fontSize: 15, fontWeight: '600', color: C.text },
    rowPhone: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
    addedLabel: { fontSize: 13, color: C.textLight, fontStyle: 'italic' },
    empty: {
      alignItems: 'center',
      paddingTop: 64,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: C.text,
      marginTop: 12,
    },
    emptyText: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 6,
    },
    settingsBtn: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: C.control,
    },
    settingsBtnText: { fontSize: 14, fontWeight: '600', color: C.white },
  });
}
