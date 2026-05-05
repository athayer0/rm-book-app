import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { usePeople } from '../hooks/usePeople';
import { IndicatorGrid } from '../components/IndicatorGrid';
import { SectionHeader } from '../components/SectionHeader';
import { PersonCard } from '../components/PersonCard';
import { WeeklyPlanningModal } from '../modals/WeeklyPlanningModal';
import { format } from 'date-fns';
import { getWeekKey } from '../utils/dateUtils';

export function HomeScreen({ navigation }: any) {
  const { definitions, counts, increment, reset } = useWeeklyIndicators();
  const { people, toggleStar } = usePeople();
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
        {/* Weekly Key Indicators */}
        <View style={styles.card}>
          <SectionHeader
            title="Weekly Key Indicators"
            actionLabel="VIEW ALL"
            onAction={() => navigation.navigate('Goals')}
          />
          <View style={styles.weekBadge}>
            <Text style={styles.weekText}>{weekLabel}</Text>
          </View>
          <IndicatorGrid
            definitions={definitions}
            counts={counts}
            onIncrement={increment}
            onReset={reset}
          />
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => setPlanningVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.planBtnText}>WEEKLY PLANNING</Text>
          </TouchableOpacity>
        </View>

        {/* Progressing People */}
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

      <WeeklyPlanningModal visible={planningVisible} onClose={() => setPlanningVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: Colors.card,
    marginHorizontal: 0,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  weekBadge: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 8,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  weekText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },
  planBtn: {
    margin: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  planBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
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
    color: Colors.textLight,
    marginTop: 8,
  },
  emptyAction: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '600',
    marginTop: 8,
  },
});
