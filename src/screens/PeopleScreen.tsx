import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { usePeople, Person } from '../hooks/usePeople';
import { PersonCard } from '../components/PersonCard';
import { AddEditPersonModal } from '../modals/AddEditPersonModal';
import { FAB } from '../components/FAB';

export function PeopleScreen() {
  const { people, addPerson, updatePerson, deletePerson, toggleStar } = usePeople();
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [search, setSearch] = useState('');

  const filtered = people
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));

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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>People</Text>
        <Text style={styles.headerCount}>{people.length}</Text>
      </View>

      {/* Search */}
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
            <Text style={styles.emptyTitle}>{search ? 'No matches' : 'No people yet'}</Text>
            <Text style={styles.emptyText}>
              {search ? 'Try a different search' : 'Tap + to add someone you\'re tracking'}
            </Text>
          </View>
        ) : (
          filtered.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              onPress={() => handleEdit(person)}
              onToggleStar={() => toggleStar(person.id)}
            />
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },
  headerCount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
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
    color: Colors.text,
  },
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { paddingTop: 12, paddingBottom: 20 },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
