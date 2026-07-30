import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { usePeople } from '../hooks/usePeople';
import { statusRank, groupByStatus } from '../constants/personStatuses';
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
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerLabels}>
          <Text style={styles.headerTitle}>Select People</Text>
          <Text style={styles.headerCount}>
            {selected.length === 0 ? 'None selected' : `${selected.length} selected`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onConfirm(selected)}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search people..."
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
                {search.length > 0 ? 'No matches' : 'No people yet'}
              </Text>
              <Text style={styles.emptyText}>
                {search.length > 0
                  ? 'Try a different search'
                  : 'Add someone on the People tab first'}
              </Text>
            </View>
          ) : (
            groups.map(group => (
              <View key={group.label ?? '__ungrouped'}>
                {group.label && (
                  <View style={[styles.sectionRow, rowIndex === 0 && styles.sectionRowFirst]}>
                    <Text style={styles.sectionLabel}>{group.label}</Text>
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
    headerTitle: { fontSize: 17, fontWeight: '600', color: C.text },
    headerCount: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    cancel: { fontSize: 16, color: C.textSecondary },
    done: { fontSize: 16, fontWeight: '600', color: C.accent },
    body: { flex: 1, backgroundColor: C.background },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },
    scroll: { flex: 1 },
    content: { paddingTop: 12 },
    sectionRow: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    sectionRowFirst: { paddingTop: 0 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
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
  });
}
