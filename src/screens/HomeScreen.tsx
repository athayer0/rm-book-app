import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { usePeople } from '../hooks/usePeople';
import { IndicatorGrid } from '../components/IndicatorGrid';
import { SectionHeader } from '../components/SectionHeader';
import { PersonCard } from '../components/PersonCard';
import { WeeklyPlanningModal } from '../modals/WeeklyPlanningModal';
import { KIWeeklyModal } from '../modals/KIWeeklyModal';
import { getWeekKey } from '../utils/dateUtils';

export function HomeScreen({ navigation }: any) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { definitions, counts, updateDefinitions, reload } = useWeeklyIndicators();

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const { people, toggleStar } = usePeople();
  const [editVisible, setEditVisible] = useState(false);
  const [planningVisible, setPlanningVisible] = useState(false);

  const weekLabel = getWeekKey();
  const featuredPeople = people
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
    .slice(0, 3);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
        <View style={styles.headerRight}>
          <Ionicons name="notifications-outline" size={24} color={Colors.white} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <SectionHeader
            title="Weekly Key Indicators"
            actionLabel="EDIT"
            onAction={() => setEditVisible(true)}
          />
          <IndicatorGrid
            definitions={definitions}
            counts={counts}
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
          <SectionHeader
            title="Progressing People"
            actionLabel="VIEW ALL"
            onAction={() => navigation.navigate('People')}
          />
          {featuredPeople.length === 0 ? (
            <View style={styles.emptyPeople}>
              <Ionicons name="people-outline" size={32} color={Colors.textLight} />
              <Text style={styles.emptyText}>No people added yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('People')}>
                <Text style={styles.emptyAction}>Add someone</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.peopleList}>
              {featuredPeople.map(person => (
                <PersonCard
                  key={person.id}
                  person={person}
                  onPress={() => navigation.navigate('People')}
                  onToggleStar={() => toggleStar(person.id)}
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

      <KIWeeklyModal
        visible={planningVisible}
        onClose={() => setPlanningVisible(false)}
        definitions={definitions}
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
      paddingVertical: 14,
      backgroundColor: C.primary,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: C.white,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 16,
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
