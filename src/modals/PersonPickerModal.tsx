import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { usePeople } from '../hooks/usePeople';
import { statusRank, groupByStatus, statusGroupLabel } from '../constants/personStatuses';
import { PersonCard } from '../components/PersonCard';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  /** Who is already on the event. Seeds the selection each time this opens. */
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

/**
 * Choose people for an event, laid out like the People tab.
 *
 * Selection is held here and handed over whole on Done, so backing out leaves
 * the event exactly as it was — the same bargain every other sheet in the app
 * makes, and the reason this isn't a dropdown writing straight through.
 *
 * Same grouping and sort as the People tab, by way of the shared helpers, minus
 * the status filter: narrowing to one status while picking would hide people
 * already chosen, and a selection you can't see is one you can't undo.
 */
export function PersonPickerModal({ visible, selectedIds, onConfirm, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { people } = usePeople();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(selectedIds);

  // Re-seed on open rather than on mount: this stays mounted between openings,
  // so mount-time state would still hold the previous event's picks.
  useEffect(() => {
    if (visible) {
      setSelected(selectedIds);
      setSearch('');
    }
  }, [visible, selectedIds]);

  const matches = useMemo(
    () => people
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const diff = statusRank(a.status) - statusRank(b.status);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }),
    [people, search],
  );

  const groups = useMemo(() => groupByStatus(matches), [matches]);

  function toggle(personId: string) {
    setSelected(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId]
    );
  }

  // Rows are numbered across the whole list, so only the very first one draws a
  // top border — a heading already separates every group after it.
  let rowIndex = 0;

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>{t('personPicker.title')}</Text>
          <Text style={styles.headerCount}>
            {selected.length === 0 ? t('personPicker.noneSelected') : t('personPicker.selectedCount', { count: selected.length })}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onConfirm(selected)}>
          <Text style={styles.done}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('people.searchPlaceholder')}
            placeholderTextColor={Colors.textLight}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>

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
                {search.length > 0 ? t('people.noMatches') : t('people.noPeopleYet')}
              </Text>
              <Text style={styles.emptyText}>
                {search.length > 0
                  ? t('personPicker.tryDifferentSearch')
                  : t('personPicker.addSomeoneFirst')}
              </Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.label ?? '__ungrouped'}>
                {group.label && (
                  <View style={[styles.sectionRow, rowIndex === 0 && styles.sectionRowFirst]}>
                    <Text style={styles.sectionLabel}>{statusGroupLabel(group.label, t)}</Text>
                  </View>
                )}
                {group.people.map(person => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onPress={() => toggle(person.id)}
                    isFirst={rowIndex++ === 0}
                    selected={selected.includes(person.id)}
                  />
                ))}
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
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
    cancel: { fontSize: 16, color: C.textSecondary },
    done: { fontSize: 16, fontWeight: '600', color: C.accent },
    /**
     * Everything below the header is the People tab's, value for value — the
     * search well, the list surface, the section bands, the empty state. The two
     * lists hold the same rows and are read the same way, so any difference here
     * is just drift, and the picker had drifted: it put a card-coloured search
     * bar on a background-coloured page, which is the People tab's arrangement
     * exactly inverted.
     *
     * The header is deliberately not shared. That one is a sheet's — Cancel, a
     * count, Done — not a screen's.
     */
    body: { flex: 1, backgroundColor: C.card, paddingTop: 10 },
    // The well is `background` *on* the card, not a card floating on the page.
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      marginHorizontal: 16,
      marginTop: -1,
      marginBottom: 0,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    searchIcon: {},
    searchInput: { flex: 1, fontSize: 16, color: C.text },
    scroll: { flex: 1, backgroundColor: C.card },
    content: { paddingTop: 12, paddingBottom: 20 },
    // A filled band rather than bare text above the rows, which is what lets a
    // heading separate two groups without a rule.
    sectionRow: {
      backgroundColor: C.background,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    // Only the first, and it closes the gap under the search bar: every later
    // band already has rows above it to sit against.
    sectionRowFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    empty: {
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: C.textSecondary,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      color: C.textLight,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
  });
}
