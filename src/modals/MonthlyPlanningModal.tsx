import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { GoalDefinition, MAX_VISIBLE_GOALS } from '../constants/defaultGoals';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  onUpdateDefinitions: (defs: GoalDefinition[]) => Promise<void>;
}

/**
 * The monthly counterpart to WeeklyPlanningModal, pared down to just one
 * control: which goals show on the Home screen's monthly grid. There is no
 * separate monthly goal list to add to or delete from — a goal's label, icon,
 * colour, and existence are edited from the weekly planning screen only, and
 * `monthlyVisible` is just a second, independent flag on the same definition.
 */
export function MonthlyPlanningModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [localDefs, setLocalDefs] = useState<GoalDefinition[]>(definitions);

  useEffect(() => {
    if (visible) setLocalDefs(definitions);
  }, [visible]);

  // Edits are committed when the sheet closes — including an iOS swipe-down dismiss,
  // which fires onRequestClose for a pageSheet. onClose fires first so the sheet's
  // slide-out animation starts immediately rather than waiting on the definitions
  // write (an AsyncStorage save plus one sequential sync-queue enqueue per goal).
  function handleClose() {
    onClose();
    onUpdateDefinitions(localDefs);
  }

  const monthlyVisibleCount = localDefs.filter(d => d.monthlyVisible).length;
  const atMonthlyVisibleLimit = monthlyVisibleCount >= MAX_VISIBLE_GOALS;

  // Un-hiding only goes through when there's room in the grid; hiding is always
  // allowed since it only shrinks the count.
  function toggleMonthlyVisible(def: GoalDefinition) {
    if (!def.monthlyVisible && atMonthlyVisibleLimit) return;
    setLocalDefs(prev => prev.map(d => (d.id === def.id ? { ...d, monthlyVisible: !d.monthlyVisible } : d)));
  }

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Monthly Goals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.sectionLabel}>SHOW ON MONTHLY GRID</Text>
        <View style={styles.goalList}>
        <View style={styles.goalListClip}>
          {localDefs.map((def, index) => {
            const isLast = index === localDefs.length - 1;
            return (
              <TouchableOpacity
                key={def.id}
                style={[styles.goalRow, isLast && styles.goalRowLast]}
                onPress={() => toggleMonthlyVisible(def)}
                disabled={!def.monthlyVisible && atMonthlyVisibleLimit}
                activeOpacity={0.7}
              >
                <View style={[styles.goalIcon, { backgroundColor: isDark ? def.color : def.color + '20' }, !def.monthlyVisible && styles.hiddenDim]}>
                  <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={20} color={isDark ? lightenColor(def.color) : def.color} />
                </View>
                <Text style={[styles.goalLabel, !def.monthlyVisible && styles.hiddenDim]} numberOfLines={1}>
                  {def.label}
                </Text>

                <Ionicons
                  name={def.monthlyVisible ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={def.monthlyVisible ? Colors.textSecondary : Colors.textLight}
                />
              </TouchableOpacity>
            );
          })}
        </View>
        </View>

        {atMonthlyVisibleLimit && (
          <Text style={styles.limitText}>{`Maximum of ${MAX_VISIBLE_GOALS} goals shown at once`}</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    closeBtn: {
      width: 60,
      alignItems: 'flex-start',
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      padding: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    // Shadow only — kept off goalListClip because overflow:'hidden' clips a
    // shadow along with everything else, which on iOS erases it outright.
    goalList: {
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    goalListClip: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    goalRowLast: {
      borderBottomWidth: 0,
    },
    goalIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
    hiddenDim: {
      opacity: 0.4,
    },
    limitText: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textLight,
      textAlign: 'center',
      marginTop: 14,
    },
  });
}
