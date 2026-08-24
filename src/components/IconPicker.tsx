import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { BottomSheet } from './BottomSheet';
import { GoalIcon } from './GoalIcon';

export interface IconOption { name: string; family: string; }

// Alphabetical by icon name, family included or not — a fixed, arbitrary set
// like this has no natural grouping (by theme it's a judgment call every time
// someone adds one), so alphabetical is the one ordering that stays stable
// and predictable as the list grows.
export const ICON_OPTIONS: IconOption[] = [
  { name: 'airplane',            family: 'Ionicons' },
  { name: 'alarm-outline',       family: 'Ionicons' },
  { name: 'ban-outline',         family: 'Ionicons' },
  { name: 'barbell-outline',     family: 'Ionicons' },
  { name: 'basketball-outline',  family: 'Ionicons' },
  { name: 'bed-outline',         family: 'Ionicons' },
  { name: 'bicycle',             family: 'Ionicons' },
  { name: 'book-outline',        family: 'Ionicons' },
  { name: 'briefcase-outline',   family: 'Ionicons' },
  { name: 'broom',               family: 'MaterialCommunityIcons' },
  { name: 'brush-outline',       family: 'Ionicons' },
  { name: 'bulb-outline',        family: 'Ionicons' },
  { name: 'call-outline',        family: 'Ionicons' },
  { name: 'chatbubbles-outline', family: 'Ionicons' },
  { name: 'checkmark-circle-outline', family: 'Ionicons' },
  { name: 'church',              family: 'MaterialCommunityIcons' },
  { name: 'color-palette-outline', family: 'Ionicons' },
  { name: 'compass',             family: 'Ionicons' },
  { name: 'cross',               family: 'MaterialCommunityIcons' },
  { name: 'fitness-outline',     family: 'Ionicons' },
  { name: 'flower-outline',      family: 'Ionicons' },
  { name: 'food-apple',          family: 'MaterialCommunityIcons' },
  { name: 'football-outline',    family: 'Ionicons' },
  { name: 'gift-outline',        family: 'Ionicons' },
  { name: 'globe-outline',       family: 'Ionicons' },
  { name: 'guitar-acoustic',     family: 'MaterialCommunityIcons' },
  { name: 'hands-pray',          family: 'MaterialCommunityIcons' },
  { name: 'happy-outline',       family: 'Ionicons' },
  { name: 'heart',               family: 'Ionicons' },
  { name: 'home',                family: 'Ionicons' },
  { name: 'journal-outline',     family: 'Ionicons' },
  { name: 'laptop-outline',      family: 'Ionicons' },
  { name: 'leaf',                family: 'Ionicons' },
  { name: 'library-outline',     family: 'Ionicons' },
  { name: 'medkit-outline',      family: 'Ionicons' },
  { name: 'meditation',          family: 'MaterialCommunityIcons' },
  { name: 'moon',                family: 'Ionicons' },
  { name: 'musical-notes',       family: 'Ionicons' },
  { name: 'paw-outline',         family: 'Ionicons' },
  { name: 'people',              family: 'Ionicons' },
  { name: 'person-outline',      family: 'Ionicons' },
  { name: 'piano',               family: 'MaterialCommunityIcons' },
  { name: 'piggy-bank',          family: 'MaterialCommunityIcons' },
  { name: 'pulse-outline',       family: 'Ionicons' },
  { name: 'restaurant-outline',  family: 'Ionicons' },
  { name: 'ribbon',              family: 'Ionicons' },
  { name: 'run',                 family: 'MaterialCommunityIcons' },
  { name: 'school',              family: 'Ionicons' },
  { name: 'shower',              family: 'MaterialCommunityIcons' },
  { name: 'star',                family: 'Ionicons' },
  { name: 'sunny',               family: 'Ionicons' },
  { name: 'swim',                family: 'MaterialCommunityIcons' },
  { name: 'synagogue',           family: 'MaterialCommunityIcons' },
  { name: 'time-outline',        family: 'Ionicons' },
  { name: 'trophy',              family: 'Ionicons' },
  { name: 'walk-outline',        family: 'Ionicons' },
  { name: 'wallet-outline',      family: 'Ionicons' },
  { name: 'water',               family: 'Ionicons' },
  { name: 'weight-lifter',       family: 'MaterialCommunityIcons' },
  { name: 'yoga',                family: 'MaterialCommunityIcons' },
];

/**
 * What anything given an icon here starts out as — a new goal, a type just
 * added to the quick-add bubbles. Named for the same reason `DEFAULT_GOAL_COLOR`
 * is: reading it off `ICON_OPTIONS[0]` would make the starting icon a side
 * effect of how that list happens to be sorted, so an insertion at the top
 * would silently change what everything added afterwards looks like.
 *
 * Two people: generic enough to be about anything, and — beside the neutral
 * grey a new goal starts on — it reads as a placeholder rather than as a choice
 * already made.
 */
export const DEFAULT_ICON: IconOption = { name: 'people', family: 'Ionicons' };

const CELL_SIZE = 52;
const GRID_GAP = 10;

// Tall enough to show several rows at once without the sheet swallowing the
// whole screen; BottomSheet clamps it further on a short phone. The full
// grid is taller than this, so it scrolls inside — see `scroll` below.
const SHEET_HEIGHT = 420;

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
 * the colour picker. Used inside `IconPickerSheet` below and as
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

interface SheetProps {
  visible: boolean;
  /** The icon the sheet opens on, and what Cancel restores. */
  icon: string;
  iconFamily: string;
  /** Tint for the selected cell — the goal's own colour. */
  color: string;
  /** Names what is being given an icon. */
  title?: string;
  onCancel: () => void;
  onDone: (opt: IconOption) => void;
}

/**
 * The grid above in a bottom sheet, drafted and committed on Done — the
 * counterpart to `ColorPickerSheet`, and what a row on a list screen opens.
 *
 * Only ever open this from a screen that is at most one Modal deep (a
 * `SheetModal`, or the tab screen itself). See `ColorPickerSheet` for what a
 * third stacked native Modal does on iOS.
 */
export function IconPickerSheet({
  visible, icon, iconFamily, color, title, onCancel, onDone,
}: SheetProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [draft, setDraft] = useState<IconOption>({ name: icon, family: iconFamily });

  useEffect(() => {
    if (!visible) return;
    setDraft({ name: icon, family: iconFamily });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <BottomSheet
      visible={visible}
      title={title ?? t('iconPicker.title')}
      height={SHEET_HEIGHT}
      onCancel={onCancel}
      onDone={() => onDone(draft)}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.sheetContent} bounces={false}>
        <IconPicker
          icon={draft.name}
          iconFamily={draft.family}
          color={color}
          onSelect={setDraft}
        />
      </ScrollView>
    </BottomSheet>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    sheetContent: { padding: 16 },
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
