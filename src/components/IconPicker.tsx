import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalIcon } from './GoalIcon';

export interface IconOption { name: string; family: string; }

// Alphabetical by icon name, family included or not — a fixed, arbitrary set
// like this has no natural grouping (by theme it's a judgment call every time
// someone adds one), so alphabetical is the one ordering that stays stable
// and predictable as the list grows.
export const ICON_OPTIONS: IconOption[] = [
  { name: 'airplane',            family: 'Ionicons' },
  { name: 'barbell-outline',     family: 'Ionicons' },
  { name: 'bicycle',             family: 'Ionicons' },
  { name: 'book-outline',        family: 'Ionicons' },
  { name: 'briefcase-outline',   family: 'Ionicons' },
  { name: 'bulb-outline',        family: 'Ionicons' },
  { name: 'call-outline',        family: 'Ionicons' },
  { name: 'church',              family: 'MaterialCommunityIcons' },
  { name: 'color-palette-outline', family: 'Ionicons' },
  { name: 'compass',             family: 'Ionicons' },
  { name: 'cross',               family: 'MaterialCommunityIcons' },
  { name: 'gift-outline',        family: 'Ionicons' },
  { name: 'hands-pray',          family: 'MaterialCommunityIcons' },
  { name: 'heart',               family: 'Ionicons' },
  { name: 'home',                family: 'Ionicons' },
  { name: 'leaf',                family: 'Ionicons' },
  { name: 'moon',                family: 'Ionicons' },
  { name: 'musical-notes',       family: 'Ionicons' },
  { name: 'people',              family: 'Ionicons' },
  { name: 'person-outline',      family: 'Ionicons' },
  { name: 'restaurant-outline',  family: 'Ionicons' },
  { name: 'ribbon',              family: 'Ionicons' },
  { name: 'run',                 family: 'MaterialCommunityIcons' },
  { name: 'school',              family: 'Ionicons' },
  { name: 'star',                family: 'Ionicons' },
  { name: 'sunny',               family: 'Ionicons' },
  { name: 'synagogue',           family: 'MaterialCommunityIcons' },
  { name: 'time-outline',        family: 'Ionicons' },
  { name: 'trophy',              family: 'Ionicons' },
  { name: 'water',               family: 'Ionicons' },
];

const CELL_SIZE = 52;
const GRID_GAP = 10;

interface Props {
  icon: string;
  iconFamily: string;
  /** Tint for the selected option. */
  color: string;
  onSelect: (opt: IconOption) => void;
}

/**
 * Every icon on offer, laid out as a plain wrapping grid. A tap updates the
 * selection in place rather than immediately closing whatever this is a step
 * inside of — the caller's own Cancel/Done is what leaves the grid, same as
 * the colour picker. Used as a full-page step inside a caller's own
 * BottomSheet (see EditGoalSheet's `iconPickerOpen`) and as
 * QuickAddTypesModal's own small icon sheet — both hand it the same
 * icon/iconFamily/color/onSelect contract, so it has no opinion on what
 * wraps it.
 *
 * Replaces the old horizontal scroll strip: a row of icons a few at a time
 * hid most of the set behind a scroll a first-time user had no reason to
 * try, where a grid shows the whole set at a glance.
 */
export function IconPicker({ icon, iconFamily, color, onSelect }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.grid}>
      {ICON_OPTIONS.map(opt => {
        const isSelected = icon === opt.name && iconFamily === opt.family;
        return (
          <TouchableOpacity
            key={`${opt.family}:${opt.name}`}
            onPress={() => onSelect(opt)}
            style={[
              styles.cell,
              isSelected && { backgroundColor: color + '25', borderColor: color },
            ]}
            activeOpacity={0.7}
          >
            <GoalIcon
              icon={opt.name}
              iconFamily={opt.family}
              size={24}
              color={isSelected ? color : Colors.textSecondary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
    },
    cell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
  });
}
