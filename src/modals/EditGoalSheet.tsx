import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { IconPicker, ICON_OPTIONS } from '../components/IconPicker';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { BottomSheet } from '../components/BottomSheet';

/** Where a new goal's colour starts before the picker is touched. */
const NEW_GOAL_COLOR = DEFAULT_GOAL_COLOR;

// Header, the three fields, nothing that grows — so, like DurationSheet, the
// sheet is a fixed height rather than measured. Two heights rather than one:
// a built-in edit drops the Name field entirely, and sizing for the taller
// case left a built-in's sheet with a slab of empty space below the Color row.
const SHEET_HEIGHT_WITH_NAME = 340;
const SHEET_HEIGHT_NO_NAME = 270;

export interface GoalDraft {
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
}

interface Props {
  visible: boolean;
  /** The goal being edited, or undefined when the sheet is creating a new one. */
  goal?: GoalDefinition;
  onCancel: () => void;
  onSave: (draft: GoalDraft) => void;
}

/**
 * A single goal's name/icon/colour, in one sheet stacked over the (now static)
 * "Edit Goals" list — replaces the old per-row `Collapsible` that used to push
 * every row below it down the screen. Handles both editing an existing goal
 * and drafting a new one; `goal` being undefined is what tells the two apart.
 *
 * Edits are a draft here, unlike the list row they used to live in: that panel
 * committed to `localDefs` on every keystroke because it had no Cancel to
 * honour. This one does, so it holds its own state and only hands it back on Done.
 */
export function EditGoalSheet({ visible, goal, onCancel, onSave }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { height } = useWindowDimensions();

  const isNew = !goal;
  // Built-ins keep their name; only custom goals and the new-goal draft expose it.
  const nameEditable = isNew || !goal?.builtIn;
  const sheetHeight = Math.min(
    nameEditable ? SHEET_HEIGHT_WITH_NAME : SHEET_HEIGHT_NO_NAME,
    Math.round(height * 0.5),
  );

  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0].name);
  const [iconFamily, setIconFamily] = useState(ICON_OPTIONS[0].family);
  const [color, setColor] = useState(NEW_GOAL_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLabel(goal?.label ?? '');
    setIcon(goal?.icon ?? ICON_OPTIONS[0].name);
    setIconFamily(goal?.iconFamily ?? ICON_OPTIONS[0].family);
    setColor(goal?.color ?? NEW_GOAL_COLOR);
    setColorPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, goal?.id]);

  const trimmed = label.trim();
  const canSave = !nameEditable || trimmed.length > 0;

  function handleDone() {
    if (!canSave) return;
    onSave({ label: nameEditable ? trimmed : label, icon, iconFamily, color });
  }

  return (
    <>
      <BottomSheet
        visible={visible}
        title={isNew ? 'New Goal' : goal?.label}
        height={sheetHeight}
        onCancel={onCancel}
        onDone={handleDone}
      >
        <View style={styles.content}>
          {nameEditable && (
            <>
              <Text style={styles.pickerLabel}>Name</Text>
              <TextInput
                style={styles.nameInput}
                value={label}
                onChangeText={setLabel}
                placeholder="Goal name..."
                placeholderTextColor={Colors.textLight}
                returnKeyType="done"
              />
            </>
          )}

          <Text style={styles.pickerLabel}>Icon</Text>
          <IconPicker
            icon={icon}
            iconFamily={iconFamily}
            color={color}
            onSelect={opt => { setIcon(opt.name); setIconFamily(opt.family); }}
          />

          <Text style={styles.pickerLabel}>Color</Text>
          <ColorTrigger
            styles={styles}
            color={color}
            textLight={Colors.textLight}
            onPress={() => setColorPickerOpen(true)}
          />
        </View>
      </BottomSheet>

      {/* A Modal of its own, so it layers correctly over the BottomSheet above. */}
      <ColorPickerSheet
        visible={colorPickerOpen}
        color={color}
        title={isNew ? 'New Goal' : goal?.label}
        onCancel={() => setColorPickerOpen(false)}
        onDone={hex => { setColor(hex); setColorPickerOpen(false); }}
      />
    </>
  );
}

/** The row that stands in for the old inline picker: the colour, and a way in. */
function ColorTrigger({
  styles, color, textLight, onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  color: string;
  textLight: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.colorTrigger} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.colorTriggerDot, { backgroundColor: color }]} />
      <Text style={styles.colorTriggerText}>{color}</Text>
      <Ionicons name="chevron-forward" size={16} color={textLight} />
    </TouchableOpacity>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    content: {
      padding: 16,
    },
    pickerLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      marginBottom: 8,
    },
    nameInput: {
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    colorTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: C.contactActionBg,
    },
    colorTriggerDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      marginRight: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    colorTriggerText: {
      flex: 1,
      fontSize: 14,
      color: C.text,
      fontVariant: ['tabular-nums'],
    },
  });
}
