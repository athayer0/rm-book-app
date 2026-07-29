import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { usePeople } from '../hooks/usePeople';
import { GoalGrid } from '../components/GoalGrid';
import { SectionHeader } from '../components/SectionHeader';
import { PersonCard } from '../components/PersonCard';
import { WeeklyPlanningModal } from '../modals/WeeklyPlanningModal';
import { GoalWeeklyModal } from '../modals/GoalWeeklyModal';
import { AddEditPersonModal } from '../modals/AddEditPersonModal';
import { Person } from '../hooks/usePeople';

export function HomeScreen({ navigation }: any) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { definitions, counts, goals, updateDefinitions, reload } = useWeeklyGoals();
  const { people, updatePerson, deletePerson, reload: reloadPeople } = usePeople();

  useFocusEffect(useCallback(() => { reload(); reloadPeople(); }, [reload, reloadPeople]));
  const [editVisible, setEditVisible] = useState(false);
  const [planningVisible, setPlanningVisible] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [personModalVisible, setPersonModalVisible] = useState(false);

  const featuredPeople = people.filter(p => p.starred);

  function handlePersonPress(person: Person) {
    setEditingPerson(person);
    setPersonModalVisible(true);
  }

  async function handlePersonSave(personData: Omit<Person, 'id' | 'createdAt'>) {
    if (editingPerson) await updatePerson(editingPerson.id, personData);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <SectionHeader
            title="Weekly Goals"
            actionLabel="EDIT"
            onAction={() => setEditVisible(true)}
          />
          <GoalGrid
            definitions={definitions}
            counts={counts}
            goals={goals}
            onPressGoal={() => setPlanningVisible(true)}
          />
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => setPlanningVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.planBtnText}>WEEKLY PLANNING</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <SectionHeader title="Favorites" />
          {featuredPeople.length === 0 ? (
            <View style={styles.emptyPeople}>
              <Ionicons name="people-outline" size={32} color={Colors.textLight} />
              <Text style={styles.emptyText}>No favorites yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('People')}>
                <Text style={styles.emptyAction}>Star someone to see them here</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.peopleList}>
              {featuredPeople.map((person, index) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  onPress={() => handlePersonPress(person)}
                  isFirst={index === 0}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <WeeklyPlanningModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        definitions={definitions}
        onUpdateDefinitions={updateDefinitions}
      />

      <GoalWeeklyModal
        visible={planningVisible}
        onClose={() => { setPlanningVisible(false); reload(); }}
        definitions={definitions}
      />

      <AddEditPersonModal
        visible={personModalVisible}
        person={editingPerson}
        onSave={handlePersonSave}
        onDelete={(id) => { deletePerson(id); setPersonModalVisible(false); }}
        onClose={() => setPersonModalVisible(false)}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: C.white,
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      paddingTop: 12,
      paddingBottom: 20,
    },
    card: {
      backgroundColor: C.card,
      marginHorizontal: 0,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    planBtn: {
      margin: 16,
      marginTop: 8,
      borderWidth: 2,
      borderColor: C.accent,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    planBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: C.accent,
      letterSpacing: 1.2,
    },
    peopleList: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    emptyPeople: {
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 14,
      color: C.textLight,
      marginTop: 8,
    },
    emptyAction: {
      fontSize: 14,
      color: C.accent,
      fontWeight: '600',
      marginTop: 8,
    },
  });
}
