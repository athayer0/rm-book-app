import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { IconPicker, ICON_OPTIONS } from '../components/IconPicker';
import { ColorPickerBody, useColorPickerStyles, useEmbeddedColorPicker } from '../components/ColorPickerSheet';
import { BottomSheet } from '../components/BottomSheet';
import { GoalIcon } from '../components/GoalIcon';
import { DropdownItem, Collapsible } from '../components/DropdownMenu';

/** Where a new goal's colour starts before the picker is touched. */
const NEW_GOAL_COLOR = DEFAULT_GOAL_COLOR;

// Header, the fields, nothing that grows — so, like DurationSheet, the sheet
// is a fixed height rather than measured. Two heights rather than one: a
// built-in edit drops the Name (and so the Linked Event Type) field entirely,
// and sizing for the taller case left a built-in's sheet with a slab of empty
// space below the Color row.
const SHEET_HEIGHT_WITH_NAME = 460;
const SHEET_HEIGHT_NO_NAME = 270;
// The color step swaps in ColorPickerBody, which wants roughly the same room
// ColorPickerSheet gives it on its own — see that file's own sheetHeight.
const SHEET_HEIGHT_COLOR = 420;

export interface GoalDraft {
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  /** Custom goals only: the custom event type whose completions feed this goal. */
  eventTypeId?: string;
}

interface Props {
  visible: boolean;
  /** The goal being edited, or undefined when the sheet is creating a new one. */
  goal?: GoalDefinition;
  /** Built-ins only: the stock color to offer as a way back. */
  defaultColor?: string;
  /** Custom event types with no linked goal, plus whichever one links to this goal. */
  availableEventTypes: EventTypeDefinition[];
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
 *
 * The colour picker is a *step* within this same sheet (see `colorPickerOpen`
 * below driving the BottomSheet's own title/Cancel/Done) rather than a second
 * BottomSheet opened on top of this one. Two native Modals stacked on top of
 * this list's own SheetModal — three deep in all — is what used to make
 * tapping Color do nothing and leave the app stuck: see the comment on
 * `useEmbeddedColorPicker`.
 */
export function EditGoalSheet({ visible, goal, defaultColor, availableEventTypes, onCancel, onSave }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { styles: colorStyles } = useColorPickerStyles();
  const { height } = useWindowDimensions();

  const isNew = !goal;
  // Built-ins keep their name; only custom goals and the new-goal draft expose
  // it — and the link field along with it, since a built-in goal is already
  // claimed by its hardcoded contribution in getGoalContribution.
  const nameEditable = isNew || !goal?.builtIn;

  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0].name);
  const [iconFamily, setIconFamily] = useState(ICON_OPTIONS[0].family);
  const [color, setColor] = useState(NEW_GOAL_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [eventTypeId, setEventTypeId] = useState<string | undefined>(undefined);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const colorPicker = useEmbeddedColorPicker(colorPickerOpen, color);

  const sheetHeight = Math.min(
    colorPickerOpen ? SHEET_HEIGHT_COLOR : nameEditable ? SHEET_HEIGHT_WITH_NAME : SHEET_HEIGHT_NO_NAME,
    Math.round(height * 0.7),
  );

  useEffect(() => {
    if (!visible) return;
    setLabel(goal?.label ?? '');
    setIcon(goal?.icon ?? ICON_OPTIONS[0].name);
    setIconFamily(goal?.iconFamily ?? ICON_OPTIONS[0].family);
    setColor(goal?.color ?? NEW_GOAL_COLOR);
    setColorPickerOpen(false);
    setEventTypeId(goal ? availableEventTypes.find(t => t.goalId === goal.id)?.id : undefined);
    setTypePickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, goal?.id]);

  const trimmed = label.trim();
  const canSave = !nameEditable || trimmed.length > 0;
  const linkedType = availableEventTypes.find(t => t.id === eventTypeId);

  function handleDone() {
    if (!canSave) return;
    onSave({
      label: nameEditable ? trimmed : label,
      icon, iconFamily, color,
      eventTypeId: nameEditable ? eventTypeId : undefined,
    });
  }

  return (
    <BottomSheet
      visible={visible}
      title={colorPickerOpen ? 'Color' : isNew ? 'New Goal' : goal?.label}
      height={sheetHeight}
      onCancel={colorPickerOpen ? () => setColorPickerOpen(false) : onCancel}
      onDone={colorPickerOpen ? () => { setColor(colorPicker.draft); setColorPickerOpen(false); } : handleDone}
    >
      {colorPickerOpen ? (
        <View style={styles.colorContent}>
          <ColorPickerBody
            styles={colorStyles}
            Colors={Colors}
            hsv={colorPicker.hsv}
            draft={colorPicker.draft}
            opened={colorPicker.opened}
            defaultColor={defaultColor}
            tab={colorPicker.tab}
            hexEdit={colorPicker.hexEdit}
            onPick={colorPicker.pick}
            onChangeHsv={colorPicker.setHsv}
            onTabChange={colorPicker.setTab}
            onHexEdit={colorPicker.setHexEdit}
          />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
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

          {nameEditable && (
            <>
              <Text style={[styles.pickerLabel, { marginTop: 18 }]}>Linked Event Type</Text>
              <TouchableOpacity
                style={styles.colorTrigger}
                onPress={() => setTypePickerOpen(v => !v)}
                activeOpacity={0.7}
              >
                {linkedType ? (
                  <GoalIcon icon={linkedType.icon} iconFamily={linkedType.iconFamily} size={16} color={Colors.textSecondary} />
                ) : (
                  <Ionicons name="close-circle-outline" size={16} color={Colors.textLight} />
                )}
                <Text style={[styles.colorTriggerText, { marginLeft: 8 }]}>{linkedType?.label ?? 'None'}</Text>
                <Ionicons name={typePickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>

              <Collapsible open={typePickerOpen}>
                <View style={styles.linkList}>
                  <DropdownItem
                    label="None"
                    selected={eventTypeId === undefined}
                    showSeparator={availableEventTypes.length > 0}
                    onPress={() => { setEventTypeId(undefined); setTypePickerOpen(false); }}
                  />
                  {availableEventTypes.map((t, i, arr) => (
                    <DropdownItem
                      key={t.id}
                      label={t.label}
                      selected={eventTypeId === t.id}
                      showSeparator={i < arr.length - 1}
                      leading={<GoalIcon icon={t.icon} iconFamily={t.iconFamily} size={16} color={Colors.textSecondary} />}
                      labelStyle={{ marginLeft: 8 }}
                      onPress={() => { setEventTypeId(t.id); setTypePickerOpen(false); }}
                    />
                  ))}
                </View>
              </Collapsible>
            </>
          )}
        </ScrollView>
      )}
    </BottomSheet>
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
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    // The color step, unlike the ScrollView above, needs to actually fill the
    // sheet's remaining height — ColorPickerBody's panel is flex:1 and measures
    // its own box via onLayout, which reports 0 (and draws nothing) inside an
    // unflexed container.
    colorContent: {
      flex: 1,
      padding: 16,
    },
    linkList: {
      marginTop: 4,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: C.menuSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.menuBorder,
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
