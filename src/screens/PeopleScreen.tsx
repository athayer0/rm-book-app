import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { usePeople, Person } from '../hooks/usePeople';
import { PersonCard } from '../components/PersonCard';
import { AddEditPersonModal } from '../modals/AddEditPersonModal';
import { ImportContactsModal } from '../modals/ImportContactsModal';
import { FAB, FAB_SIZE, FAB_BOTTOM } from '../components/FAB';
import {
  PERSON_STATUSES, STATUS_OPTIONS, STATUS_GROUPS, statusRank, groupByStatus, statusDisplayName,
} from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { DropdownMenu, DropdownItem, MenuDivider } from '../components/DropdownMenu';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';

type FilterSelection =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'group'; name: string; statuses: string[] }
  | { kind: 'status'; name: string };

function matchesFilter(person: Person, selection: FilterSelection): boolean {
  if (selection.kind === 'all') return true;
  if (selection.kind === 'favorites') return !!person.starred;
  if (selection.kind === 'group') return selection.statuses.includes(person.status);
  return person.status === selection.name;
}

// Enough for a handful of rows on the shortest screen, so a mis-measurement can
// never leave the filter a sliver too small to use.
const MIN_FILTER_LIST_HEIGHT = 200;

type ListRow =
  | { kind: 'header'; label: string; key: string }
  | { kind: 'person'; person: Person; key: string };

function buildRows(list: Person[], selection: FilterSelection): ListRow[] {
  if (selection.kind === 'favorites') {
    if (list.length === 0) return [];
    return [
      { kind: 'header', label: 'Favorites', key: 'header' },
      ...list.map(person => ({ kind: 'person' as const, person, key: person.id })),
    ];
  }
  if (selection.kind === 'group' || selection.kind === 'status') {
    if (list.length === 0) return [];
    return [
      { kind: 'header', label: selection.name, key: 'header' },
      ...list.map(person => ({ kind: 'person' as const, person, key: person.id })),
    ];
  }
  const rows: ListRow[] = [];
  const favorites = list.filter(p => p.starred);
  const rest = list.filter(p => !p.starred);
  if (favorites.length > 0) {
    rows.push({ kind: 'header', label: 'Favorites', key: 'header-favorites' });
    favorites.forEach(person => rows.push({ kind: 'person', person, key: person.id }));
  }
  for (const group of groupByStatus(rest)) {
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState('');
  const [filterSelection, setFilterSelection] = useState<FilterSelection>({ kind: 'all' });
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  // Bulk status editing: tap Select, tap rows to pick them, then Set Type
  // applies one status to every row picked. Exclusive with the filter dropdown
  // below — both hang a menu off the same header, so only one opens at a time.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkStatusMenu, setShowBulkStatusMenu] = useState(false);
  // Both measured in the safe area's own space rather than the window's, so the
  // notch can't skew the ratio the dropdown's height is worked out from.
  const [pageHeight, setPageHeight] = useState(0);
  const [headerBottom, setHeaderBottom] = useState(0);
  const filterScrollEdges = useScrollEdges();

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const filtered = people
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(p => matchesFilter(p, filterSelection))
    .sort((a, b) => {
      // Outside the 'all' view (which gets its own Favorites section from
      // buildRows), a favorite just sorts to the top of whatever group/status/
      // favorites list it's in rather than getting a header of its own.
      if (filterSelection.kind !== 'all') {
        const favDiff = Number(!!b.starred) - Number(!!a.starred);
        if (favDiff !== 0) return favDiff;
      }
      const diff = statusRank(a.status) - statusRank(b.status);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const rows = buildRows(filtered, filterSelection);

  const isFiltered = search.length > 0 || filterSelection.kind !== 'all';

  // The filter list is longer than the screen — every group plus every status —
  // so it scrolls, stopping clear of the FAB rather than running the page's full
  // height. Measured from where the dropdown opens (just under the header) rather
  // than from the top of the page, since that lower edge is what the cap is really
  // about. The gap left above the FAB matches FAB_BOTTOM, the gap the FAB already
  // keeps below itself, so the button reads as centred in its own clearance rather
  // than crowded from one side. Falls back to the floor until the first layout
  // lands, when both measurements are still 0.
  const filterListMaxHeight = Math.max(
    pageHeight - headerBottom - (FAB_BOTTOM + FAB_SIZE + FAB_BOTTOM),
    MIN_FILTER_LIST_HEIGHT,
  ) + 10;

  function handleEdit(person: Person) {
    setEditingPerson(person);
    setShowModal(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowBulkStatusMenu(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulkStatus(status: string) {
    const ids = Array.from(selectedIds);
    for (const id of ids) await updatePerson(id, { status });
    exitSelectMode();
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
        {selectMode ? (
          <>
            <TouchableOpacity onPress={exitSelectMode} style={styles.headerSideZone}>
              <Text style={styles.headerActionText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, styles.headerSelectTitle]}>
              {selectedIds.size === 0 ? 'Select People' : `${selectedIds.size} Selected`}
            </Text>
            <View style={[styles.headerSideZone, styles.headerSideZoneRight]}>
              <TouchableOpacity
                onPress={() => setShowBulkStatusMenu(v => !v)}
                disabled={selectedIds.size === 0}
              >
                <Text style={[styles.headerActionText, selectedIds.size === 0 && styles.headerActionTextDisabled]}>
                  Set Type
                </Text>
              </TouchableOpacity>
              <DropdownMenu open={showBulkStatusMenu} align="right" style={styles.filterDropdown}>
                <ScrollView
                  style={{ maxHeight: filterListMaxHeight }}
                  nestedScrollEnabled
                  bounces={false}
                  overScrollMode="never"
                  {...filterScrollEdges.scrollViewProps}
                >
                  {STATUS_OPTIONS.map((s, i) => (
                    <DropdownItem
                      key={s}
                      label={statusDisplayName(s)}
                      showSeparator={i < STATUS_OPTIONS.length - 1}
                      leading={<StatusIcon config={PERSON_STATUSES[s]} size={14} style={styles.filterChipIcon} />}
                      onPress={() => applyBulkStatus(s)}
                    />
                  ))}
                </ScrollView>
                <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={filterScrollEdges.showTopFade} />
                <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={filterScrollEdges.showBottomFade} />
              </DropdownMenu>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.headerTitle}>People</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.filterChip}
                onPress={() => setSelectMode(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Select People"
              >
                <Ionicons name="checkbox-outline" size={24} color={Colors.onPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterChip}
                onPress={() => setShowImportModal(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Import from Contacts"
              >
                <MaterialCommunityIcons name="account-arrow-down-outline" size={24} color={Colors.onPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterChip}
                onPress={() => setShowFilterDropdown(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons name="options-outline" size={26} color={Colors.onPrimary} />
              </TouchableOpacity>

              {/* Right-aligned and content-width: it hangs off an icon button far
                  narrower than its own list, so stretching to the trigger would give
                  a menu the width of one glyph. `top` overrides the default '100%'
                  to keep the offset the header row has always used. */}
              <DropdownMenu
                open={showFilterDropdown}
                align="right"
                style={styles.filterDropdown}
              >
                <ScrollView
                  style={{ maxHeight: filterListMaxHeight }}
                  nestedScrollEnabled
                  bounces={false}
                  overScrollMode="never"
                  {...filterScrollEdges.scrollViewProps}
                >
                  <DropdownItem
                    label="All"
                    selected={filterSelection.kind === 'all'}
                    onPress={() => { setFilterSelection({ kind: 'all' }); setShowFilterDropdown(false); }}
                  />
                  {STATUS_GROUPS.map((g) => (
                    <DropdownItem
                      key={g.name}
                      label={g.name}
                      selected={filterSelection.kind === 'group' && filterSelection.name === g.name}
                      onPress={() => { setFilterSelection({ kind: 'group', name: g.name, statuses: g.statuses }); setShowFilterDropdown(false); }}
                    />
                  ))}
                  <DropdownItem
                    label="Favorites"
                    selected={filterSelection.kind === 'favorites'}
                    showSeparator={false}
                    leading={<Ionicons name="star" size={16} color={Colors.favorite} style={styles.filterChipIcon} />}
                    onPress={() => { setFilterSelection({ kind: 'favorites' }); setShowFilterDropdown(false); }}
                  />
                  <MenuDivider />
                  {STATUS_OPTIONS.map((s, i) => (
                    <DropdownItem
                      key={s}
                      label={s}
                      selected={filterSelection.kind === 'status' && filterSelection.name === s}
                      showSeparator={i < STATUS_OPTIONS.length - 1}
                      leading={<StatusIcon config={PERSON_STATUSES[s]} size={14} style={styles.filterChipIcon} />}
                      onPress={() => { setFilterSelection({ kind: 'status', name: s }); setShowFilterDropdown(false); }}
                    />
                  ))}
                </ScrollView>
                <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={filterScrollEdges.showTopFade} />
                <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={filterScrollEdges.showBottomFade} />
              </DropdownMenu>
            </View>
          </>
        )}
      </View>

      {(showFilterDropdown || showBulkStatusMenu) && (
        <Pressable
          style={styles.filterBackdrop}
          onPress={() => { setShowFilterDropdown(false); setShowBulkStatusMenu(false); }}
        />
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
                onPress={() => (selectMode ? toggleSelected(row.person.id) : handleEdit(row.person))}
                isFirst={index === 0}
                selected={selectMode ? selectedIds.has(row.person.id) : undefined}
              />
            )
          )
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      </View>
      {!selectMode && <FAB onPress={() => { setEditingPerson(null); setShowModal(true); }} />}

      <AddEditPersonModal
        visible={showModal}
        person={editingPerson}
        onSave={handleSave}
        onDelete={deletePerson}
        onClose={() => setShowModal(false)}
      />

      <ImportContactsModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
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
    // In select mode, "Cancel" and "Set Type" aren't the same width, so
    // centering the title between them (space-between's default) leaves it
    // visibly off the header's true center. Forcing both side zones to the
    // same floor — wider than either one's own content — makes them equal,
    // and flex:1 + centered text then centers against the header itself.
    headerSelectTitle: { flex: 1, textAlign: 'center' },
    headerSideZone: { minWidth: 80 },
    headerSideZoneRight: { alignItems: 'flex-end' },
    headerActionText: { fontSize: 16, fontWeight: '600', color: C.onPrimary },
    headerActionTextDisabled: { color: C.onPrimaryMuted },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    // Surface, radius, hairline and shadow all come from DropdownMenu now. What
    // is left is only what is specific to hanging off this header: the offset
    // below the chip row, and a floor on the width so the short status names
    // don't collapse it to a sliver.
    filterDropdown: {
      // 28, not the 34 this used to be: DropdownMenu adds a 6px marginTop of its
      // own, so the menu still lands exactly where it always has.
      top: 28,
      minWidth: 190,
    },
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
    searchInput: {
      flex: 1,
      fontSize: 16,
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
