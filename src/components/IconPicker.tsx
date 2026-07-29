import React, { useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Svg, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { GoalIcon } from './GoalIcon';

export interface IconOption { name: string; family: string; }

export const ICON_OPTIONS: IconOption[] = [
  { name: 'sunny',               family: 'Ionicons' },
  { name: 'moon',                family: 'Ionicons' },
  { name: 'book-outline',        family: 'Ionicons' },
  { name: 'heart',               family: 'Ionicons' },
  { name: 'star',                family: 'Ionicons' },
  { name: 'time-outline',        family: 'Ionicons' },
  { name: 'people',              family: 'Ionicons' },
  { name: 'person-outline',      family: 'Ionicons' },
  { name: 'home',                family: 'Ionicons' },
  { name: 'barbell-outline',     family: 'Ionicons' },
  { name: 'bicycle',             family: 'Ionicons' },
  { name: 'water',               family: 'Ionicons' },
  { name: 'leaf',                family: 'Ionicons' },
  { name: 'bulb-outline',        family: 'Ionicons' },
  { name: 'school',              family: 'Ionicons' },
  { name: 'trophy',              family: 'Ionicons' },
  { name: 'restaurant-outline',  family: 'Ionicons' },
  { name: 'musical-notes',       family: 'Ionicons' },
  { name: 'compass',             family: 'Ionicons' },
  { name: 'ribbon',              family: 'Ionicons' },
  { name: 'color-palette-outline', family: 'Ionicons' },
  { name: 'synagogue',           family: 'MaterialCommunityIcons' },
  { name: 'church',              family: 'MaterialCommunityIcons' },
  { name: 'hands-pray',         family: 'MaterialCommunityIcons' },
  { name: 'cross',               family: 'MaterialCommunityIcons' },
];

const OPTION_SIZE = 44;
const FADE_WIDTH = 32;
// Clearance below the icons for the scroll indicator to sit in.
const INDICATOR_GAP = 10;

// SVG gradient ids are document-global; two pickers can be on screen at once.
let gradientSeq = 0;

interface Props {
  icon: string;
  iconFamily: string;
  /** Tint for the selected option. */
  color: string;
  onSelect: (opt: IconOption) => void;
}

export function IconPicker({ icon, iconFamily, color, onSelect }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const gradientId = useMemo(() => `iconFade${gradientSeq++}`, []);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.content}
      >
        {ICON_OPTIONS.map(opt => {
          const isSelected = icon === opt.name && iconFamily === opt.family;
          return (
            <TouchableOpacity
              key={`${opt.family}:${opt.name}`}
              onPress={() => onSelect(opt)}
              style={[
                styles.option,
                isSelected && { backgroundColor: color + '25', borderColor: color },
              ]}
            >
              <GoalIcon
                icon={opt.name}
                iconFamily={opt.family}
                size={22}
                color={isSelected ? color : Colors.textSecondary}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Fades the right edge into the panel so the row reads as "continues offscreen". */}
      <Svg width={FADE_WIDTH} height={OPTION_SIZE} style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={Colors.card} stopOpacity="0" />
            <Stop offset="1" stopColor={Colors.card} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width={FADE_WIDTH} height={OPTION_SIZE} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      position: 'relative',
      marginBottom: 8,
    },
    content: {
      gap: 6,
      // Leaves the last icon peeking out from under the fade rather than flush to it.
      paddingRight: FADE_WIDTH,
      // Extends the scroll frame below the icons so the indicator lands under them
      // instead of overlapping the bottom row of glyphs.
      paddingBottom: INDICATOR_GAP,
    },
    option: {
      width: OPTION_SIZE,
      height: OPTION_SIZE,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    fade: {
      position: 'absolute',
      right: 0,
      top: 0,
    },
  });
}
