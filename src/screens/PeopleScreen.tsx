import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { usePeople, Person } from '../hooks/usePeople';
import { PersonCard } from '../components/PersonCard';
import { AddEditPersonModal } from '../modals/AddEditPersonModal';
import { FAB } from '../components/FAB';
import {
  PERSON_STATUSES, STATUS_OPTIONS, STATUS_GROUPS, statusRank, groupByStatus,
} from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';

type FilterSelection =
  | { kind: 'all' }
  | { kind: 'group'; name: string; statuses: string[] }
  | { kind: 'status'; name: string };

function matchesFilter(status: string, selection: FilterSelection): boolean {
  if (selection.kind === 'all') return true;
  if (selection.kind === 'group') return selection.statuses.includes(status);
  return status === selection.name;
}

// Enough for a handful of rows on the shortest screen, so a mis-measurement can
// never leave the filter a sliver too small to use.
const MIN_FILTER_LIST_HEIGHT = 200;

type ListRow =
  | { kind: 'header'; label: string; key: string }
  | { kind: 'person'; person: Person; key: string };

function buildRows(list: Person[], selection: FilterSelection): ListRow[] {
  if (selection.kind !== 'all') {
    if (list.length === 0) return [];
    return [
      { kind: 'header', label: selection.name, key: 'header' },
      ...list.map(person => ({ kind: 'person' as const, person, key: person.id })),
    ];
  }
  const rows: ListRow[] = [];
  for (const group of groupByStatus(list)) {
    if (group.label) rows.push({ kind: 'header', label: group.label, key: `header-${group.label}` });
    group.people.forEach(person => rows.push({ kind: 'person', person, key: person.id }));
  }
  return rows;
}

export function PeopleScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { people, addPerson, updatePerson, deletePerson, reload } = usePeople();
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState('');
  const [filterSelection, setFilterSelection] = useState<FilterSelection>({ kind: 'all' });
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  // Both measured in the safe area's own space rather than the window's, so the
  // notch can't skew the ratio the dropdown's height is worked out from.
  const [pageHeight, setPageHeight] = useState(0);
  const [headerBottom, setHeaderBottom] = useState(0);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const filtered = people
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => matchesFilter(p.status, filterSelection))
    .sort((a, b) => {
      const diff = statusRank(a.status) - statusRank(b.status);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const rows = buildRows(filtered, filterSelection);

  const isFiltered = search.length > 0 || filterSelection.kind !== 'all';

  // The filter list is longer than the screen — every group plus every status —
  // so it scrolls, stopping about three quarters of the way down the page. Measured
  // from where the dropdown opens (just under the header) rather than from the top
  // of the page, since that lower edge is what the cap is really about. Falls back
  // to the floor until the first layout lands, when both measurements are still 0.
  const filterListMaxHeight = Math.max(
    pageHeight * (3 / 4) - headerBottom,
    MIN_FILTER_LIST_HEIGHT,
  );

  function handleEdit(person: Person) {
    setEditingPerson(person);
    setShowModal(true);
  }

  async function handleSave(personData: Omit<Person, 'id' | 'createdAt'>) {
    if (editingPerson) {
      await updatePerson(editingPerson.id, personData);
    } else {
      await addPerson(personData);
    }
  }

  return (
    <SafeAreaView style={styles.safe} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
      <View
        style={styles.header}
        onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <Text style={styles.headerTitle}>People</Text>
        <View>
          <TouchableOpacity
            style={styles.filterChip}
            onPress={() => setShowFilterDropdown(v => !v)}
            activeOpacity={0.7}
          >
            <Ionicons name="options-outline" size={26} color={Colors.onPrimary} />
          </TouchableOpacity>

          {showFilterDropdown && (
            <View style={styles.filterDropdown}>
              <ScrollView
                style={{ maxHeight: filterListMaxHeight }}
                nestedScrollEnabled
                bounces={false}
                overScrollMode="never"
              >
                <TouchableOpacity
                  style={styles.filterDropdownItem}
                  onPress={() => { setFilterSelection({ kind: 'all' }); setShowFilterDropdown(false); }}
                >
                  <Text style={styles.filterDropdownText}>All</Text>
                  {filterSelection.kind === 'all' && <Ionicons name="checkmark" size={16} color={Colors.control} />}
                </TouchableOpacity>
                {STATUS_GROUPS.map(g => (
                  <TouchableOpacity
                    key={g.name}
                    style={styles.filterDropdownItem}
                    onPress={() => { setFilterSelection({ kind: 'group', name: g.name, statuses: g.statuses }); setShowFilterDropdown(false); }}
                  >
                    <Text style={styles.filterDropdownText}>{g.name}</Text>
                    {filterSelection.kind === 'group' && filterSelection.name === g.name && (
                      <Ionicons name="checkmark" size={16} color={Colors.control} />
                    )}
                  </TouchableOpacity>
                ))}
                <View style={styles.filterDropdownDivider} />
                {STATUS_OPTIONS.map(s => {
                  const cfg = PERSON_STATUSES[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      style={styles.filterDropdownItem}
                      onPress={() => { setFilterSelection({ kind: 'status', name: s }); setShowFilterDropdown(false); }}
                    >
                      <StatusIcon config={cfg} size={14} style={styles.filterChipIcon} />
                      <Text style={styles.filterDropdownText}>{s}</Text>
                      {filterSelection.kind === 'status' && filterSelection.name === s && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>

      {showFilterDropdown && (
        <Pressable style={styles.filterBackdrop} onPress={() => setShowFilterDropdown(false)} />
      )}

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>{isFiltered ? 'No matches' : 'No people yet'}</Text>
            <Text style={styles.emptyText}>
              {isFiltered ? 'Try a different search or filter' : 'Tap + to add someone you\'re tracking'}
            </Text>
          </View>
        ) : (
          rows.map((row, index) =>
            row.kind === 'header' ? (
              <View
                key={row.key}
                style={[styles.filterSectionRow, index === 0 && styles.filterSectionRowFirst]}
              >
                <Text style={styles.filterSectionLabel}>{row.label}</Text>
              </View>
            ) : (
              <PersonCard
                key={row.key}
                person={row.person}
                onPress={() => handleEdit(row.person)}
                isFirst={index === 0}
              />
            )
          )
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      </View>
      <FAB onPress={() => { setEditingPerson(null); setShowModal(true); }} />

      <AddEditPersonModal
        visible={showModal}
        person={editingPerson}
        onSave={handleSave}
        onDelete={deletePerson}
        onClose={() => setShowModal(false)}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
      zIndex: 20,
      elevation: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: C.onPrimary },
    filterChip: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipIcon: { marginRight: 6 },
    filterBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
      elevation: 10,
    },
    filterDropdown: {
      position: 'absolute',
      top: 34,
      right: 0,
      minWidth: 190,
      backgroundColor: C.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 12,
      zIndex: 21,
    },
    filterDropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    filterDropdownDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
    },
    filterDropdownText: { flex: 1, fontSize: 15, color: C.text },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      marginHorizontal: 16,
      marginTop: -1,
      marginBottom: 0,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    searchIcon: {},
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    body: { flex: 1, backgroundColor: C.card, paddingTop: 10 },
    scroll: { flex: 1, backgroundColor: C.card },
    content: { paddingTop: 12, paddingBottom: 20 },
    filterSectionRow: {
      backgroundColor: C.background,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    filterSectionRowFirst: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    filterSectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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
