import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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

/** Up to two letters for the row's avatar circle — first + last name initials. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type LoadState = 'intro' | 'loading' | 'denied' | 'error' | 'ready';

/**
 * Pulls names and numbers out of the phone's own contacts app, so someone
 * already tracked there doesn't have to be retyped by hand. Only offered here,
 * not folded into the FAB's quick-add stack — this asks for a system
 * permission and a device round trip, which the bubble menu never does.
 *
 * Opens on an `intro` step rather than firing the OS permission prompt
 * immediately: iOS's own picker lets someone share their whole address book,
 * and without a beat of explanation first that reads as the app asking for
 * all of it. The intro says up front that sharing one or two people is fine.
 * Skipped when permission was already granted in an earlier session.
 */
export function ImportContactsModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { people, addPerson } = usePeople();

  const [loadState, setLoadState] = useState<LoadState>('intro');
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

  async function requestAndLoad() {
    setLoadState('loading');
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
  }

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelected(new Set());
    (async () => {
      try {
        // A non-prompting check first: someone who already granted access in a
        // past session shouldn't see the intro step again on every open.
        const { status, accessPrivileges: privileges } = await Contacts.getPermissionsAsync();
        if (status === 'granted') {
          setAccessPrivileges(privileges);
          setLoadState('loading');
          await loadContacts();
        } else {
          setLoadState('intro');
        }
      } catch {
        setLoadState('intro');
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
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>{t('importContacts.title')}</Text>
          {loadState === 'ready' && (
            <Text style={styles.headerCount}>
              {selected.size === 0 ? t('personPicker.noneSelected') : t('personPicker.selectedCount', { count: selected.size })}
            </Text>
          )}
        </View>
        {loadState === 'ready' ? (
          <TouchableOpacity onPress={handleImport} disabled={selected.size === 0 || importing}>
            <Text style={[styles.done, (selected.size === 0 || importing) && styles.doneDisabled]}>
              {importing ? t('importContacts.adding') : t('importContacts.import')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.closeBtn} />
        )}
      </View>

      <View style={styles.body}>
        {loadState === 'intro' && (
          <View style={styles.introWrap}>
            <View style={styles.introIconCircle}>
              <Ionicons name="people" size={36} color={Colors.onPrimary} />
            </View>
            <Text style={styles.introTitle}>{t('importContacts.introTitle')}</Text>
            <Text style={styles.introBody}>
              {t('importContacts.introBody')}
            </Text>
            <TouchableOpacity style={styles.introBtn} onPress={requestAndLoad} activeOpacity={0.85}>
              <Text style={styles.introBtnText}>{t('importContacts.chooseContactsToShare')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={8}>
              <Text style={styles.introSkip}>{t('importContacts.notNow')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'ready' && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={Colors.textLight} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('importContacts.searchPlaceholder')}
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
            <Text style={styles.emptyText}>{t('importContacts.loadingContacts')}</Text>
          </View>
        )}

        {loadState === 'denied' && (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>{t('importContacts.accessDeniedTitle')}</Text>
            <Text style={styles.emptyText}>
              {t('importContacts.accessDeniedBody')}
            </Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>{t('importContacts.openSettings')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'error' && (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>{t('importContacts.couldntLoadTitle')}</Text>
            <Text style={styles.emptyText}>{t('importContacts.couldntLoadBody')}</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => { setLoadState('loading'); loadContacts().catch(() => setLoadState('error')); }}
            >
              <Text style={styles.settingsBtnText}>{t('importContacts.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loadState === 'ready' && accessPrivileges === 'limited' && (
          <View style={styles.limitedBanner}>
            <Ionicons name="person-circle-outline" size={20} color={Colors.control} />
            <Text style={styles.limitedBannerText} numberOfLines={1}>
              {t('importContacts.onlySomeShared')}
            </Text>
            <TouchableOpacity style={styles.limitedBannerBtn} onPress={openContactsSettings} activeOpacity={0.7}>
              <Text style={styles.limitedBannerBtnText}>{t('importContacts.manageSettings')}</Text>
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
                  {search.length > 0 ? t('people.noMatches') : t('importContacts.noContactsSharedYet')}
                </Text>
                {search.length === 0 && accessPrivileges === 'limited' && (
                  <>
                    <Text style={styles.emptyText}>
                      {t('importContacts.optionalSharingHint')}
                    </Text>
                    <TouchableOpacity style={styles.settingsBtn} onPress={openContactsSettings}>
                      <Text style={styles.settingsBtnText}>{t('importContacts.chooseContacts')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.listCardShadow}>
              <View style={styles.listCard}>
                {matches.map((contact, index) => {
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
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(contact.name)}</Text>
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowName} numberOfLines={1}>{contact.name}</Text>
                        {!!contact.phone && <Text style={styles.rowPhone}>{contact.phone}</Text>}
                        {!!contact.address && (
                          <Text style={styles.rowPhone} numberOfLines={1}>{contact.address}</Text>
                        )}
                      </View>
                      {alreadyAdded ? (
                        <View style={styles.addedPill}>
                          <Ionicons name="checkmark" size={13} color={Colors.textLight} />
                          <Text style={styles.addedLabel}>{t('importContacts.added')}</Text>
                        </View>
                      ) : (
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={isSelected ? Colors.control : Colors.textLight}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              </View>
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
    introWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    introIconCircle: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    introTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    introBody: {
      fontSize: 14.5,
      lineHeight: 21,
      color: C.textSecondary,
      textAlign: 'center',
      marginBottom: 28,
    },
    introBtn: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: C.control,
      alignItems: 'center',
    },
    introBtnText: { fontSize: 15.5, fontWeight: '600', color: C.white },
    introSkip: {
      fontSize: 14,
      color: C.textLight,
      marginTop: 18,
      padding: 4,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },
    limitedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    limitedBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: C.text },
    limitedBannerBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: C.control,
    },
    limitedBannerBtnText: { fontSize: 12.5, fontWeight: '600', color: C.white },
    scroll: { flex: 1 },
    content: { paddingTop: 12 },
    // Shadow only — kept off `listCard` because overflow:'hidden' clips a
    // shadow along with everything else, which on iOS erases it outright.
    listCardShadow: {
      marginHorizontal: 16,
      borderRadius: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    listCard: {
      borderRadius: 14,
      backgroundColor: C.card,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    rowFirst: { borderTopWidth: 0 },
    rowDisabled: { opacity: 0.55 },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.infoChipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: { fontSize: 13.5, fontWeight: '700', color: C.textSecondary },
    rowText: { flex: 1, marginRight: 12 },
    rowName: { fontSize: 15, fontWeight: '600', color: C.text },
    rowPhone: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
    addedPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    addedLabel: { fontSize: 13, color: C.textLight, fontWeight: '500' },
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
