import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { withAlpha } from '../utils/colorUtils';
import { usePeople } from '../hooks/usePeople';
import { useConvertProgress } from '../hooks/useConvertProgress';
import { milestonesFor } from '../constants/covenantPath';
import { PERSON_STATUSES } from '../constants/personStatuses';
import { StatusIcon } from './StatusIcon';
import { GoalIcon } from './GoalIcon';

interface Props {
  personId: string;
}

// The star that marks someone "Recent Converts" in the People tab, reused here
// so the path reads as belonging to that same status rather than borrowing the
// app's generic control blue.
const CONVERT_COLOR = PERSON_STATUSES['Recent Converts'].color;

/**
 * A convert's covenant path: baptism through sealing, in the order it's
 * walked. Aaronic and Melchizedek Priesthood ordination only apply to men, so
 * whether they belong on the list at all comes from the person's gender —
 * asked for via a popup the first time this tab opens on someone who doesn't
 * have it set yet, rather than a per-row way to remove them.
 */
export function PersonCovenantPathTab({ personId }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  // Read the person live off the People list rather than trust a prop — this tab
  // writes gender straight to storage the moment the popup is answered, and a
  // stale snapshot handed down from the sheet wouldn't pick that up.
  const { people, updatePerson } = usePeople();
  const person = people.find(p => p.id === personId);
  const { getProgress, toggleMilestone } = useConvertProgress();

  const gender = person?.gender;
  useEffect(() => {
    if (!person || gender) return;
    Alert.alert(
      'Male or Female?',
      'Decides whether priesthood ordination shows on the covenant path.',
      [
        { text: 'Female', onPress: () => updatePerson(personId, { gender: 'female' }) },
        { text: 'Male', onPress: () => updatePerson(personId, { gender: 'male' }) },
      ],
      { cancelable: false },
    );
    // updatePerson is stable from usePeople; person/gender are what this actually
    // reacts to, and re-running on every people-list change would re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, gender]);

  if (!person) return null;

  function handleToggle(milestoneId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleMilestone(personId, milestoneId);
  }

  const progress = getProgress(personId);
  const milestones = milestonesFor(gender);
  const completedCount = milestones.filter(m => progress.completed.includes(m.id)).length;
  const total = milestones.length;
  const allDone = total > 0 && completedCount === total;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.titleRow}>
          <StatusIcon config={PERSON_STATUSES['Recent Converts']} size={20} style={styles.titleIcon} />
          <Text style={styles.title} numberOfLines={1}>{person.name}'s Covenant Path</Text>
        </View>

        <View style={styles.summary}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${total ? (completedCount / total) * 100 : 0}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, allDone && styles.progressLabelDone]}>
            {completedCount}/{total} complete
          </Text>
        </View>

        <View style={styles.card}>
          {milestones.map((milestone, i) => {
            const isLast = i === milestones.length - 1;
            const complete = progress.completed.includes(milestone.id);
            return (
              <TouchableOpacity
                key={milestone.id}
                style={[styles.row, isLast && styles.rowLast]}
                onPress={() => handleToggle(milestone.id)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: complete }}
                accessibilityLabel={milestone.label}
              >
                <GoalIcon
                  icon={milestone.icon}
                  iconFamily={milestone.iconFamily}
                  size={18}
                  color={complete ? CONVERT_COLOR : Colors.textLight}
                />
                <Text style={[styles.label, complete && styles.labelDone]}>{milestone.label}</Text>
                <View style={[styles.checkbox, complete && styles.checkboxChecked]}>
                  {complete && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { paddingTop: 16 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 14,
    },
    titleIcon: {},
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    summary: {
      marginHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(CONVERT_COLOR, 0.16),
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: CONVERT_COLOR,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
    },
    // Bolder rather than recoloured at 100% — every other "done" mark on this
    // page is already CONVERT_COLOR, so a colour change here wouldn't read as
    // a change at all.
    progressLabelDone: {
      color: C.text,
      fontWeight: '700',
    },
    card: {
      backgroundColor: C.card,
      marginHorizontal: 16,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowLast: { borderBottomWidth: 0 },
    label: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    labelDone: {
      color: CONVERT_COLOR,
      fontWeight: '600',
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: CONVERT_COLOR,
      borderColor: CONVERT_COLOR,
    },
  });
}
