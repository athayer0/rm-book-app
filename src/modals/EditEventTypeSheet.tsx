import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalDefinition } from '../constants/defaultGoals';
import { IconPicker, ICON_OPTIONS } from '../components/IconPicker';
import { ColorPickerBody, useColorPickerStyles, useEmbeddedColorPicker } from '../components/ColorPickerSheet';
import { BottomSheet } from '../components/BottomSheet';
import { DurationSlider } from '../components/DurationSlider';
import { GoalIcon } from '../components/GoalIcon';
import { DropdownItem, Collapsible } from '../components/DropdownMenu';
import { isCheckboxType, hasOptionalEnd } from '../utils/eventUtils';

const NEW_TYPE_COLOR = DEFAULT_GOAL_COLOR;
const DEFAULT_TYPE_MINUTES = 30;

// Taller than EditGoalSheet's sheets: on top of name/icon/color this one also
// carries a duration slider and, for a custom type, the goal-link picker.
const SHEET_HEIGHT_CUSTOM = 620;
const SHEET_HEIGHT_BUILTIN = 340;
// The color step swaps in ColorPickerBody, which wants roughly the same room
// ColorPickerSheet gives it on its own — see that file's own sheetHeight.
const SHEET_HEIGHT_COLOR = 420;

export interface EventTypeDraft {
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  defaultMinutes: number;
  goalId?: string;
  goalMode: 'count' | 'hours';
}

interface Props {
  visible: boolean;
  /** The type being edited, or undefined when the sheet is creating a new one. */
  eventType?: EventTypeDefinition;
  /** Current resolved color/duration — these live in settings, not on the definition. */
  color?: string;
  defaultMinutes?: number;
  /** Built-ins only: the stock color to offer as a way back. */
  defaultColor?: string;
  /** Custom goals with no linked type, plus whichever one is currently linked to this type. */
  availableGoals: GoalDefinition[];
  onCancel: () => void;
  onSave: (draft: EventTypeDraft) => void;
}

/**
 * A single event type's name/icon/color/duration/goal-link, in one sheet —
 * mirrors EditGoalSheet's shape. Built-ins keep their name and icon and skip
 * the goal link (already claimed by their hardcoded contribution in
 * getGoalContribution); everything else is editable for both.
 *
 * The colour picker is a *step* within this same sheet (see `colorPickerOpen`
 * below driving the BottomSheet's own title/Cancel/Done), not a second
 * BottomSheet opened on top of this one — see the comment on
 * `useEmbeddedColorPicker` for why stacking a third native Modal there used to
 * freeze the app.
 */
export function EditEventTypeSheet({
  visible, eventType, color: initialColor, defaultMinutes: initialMinutes, defaultColor,
  availableGoals, onCancel, onSave,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { styles: colorStyles } = useColorPickerStyles();
  const { height } = useWindowDimensions();

  const isNew = !eventType;
  const isCustom = isNew || !eventType?.builtIn;
  // Checkbox types (task) and optional-end types (contact) have no duration to
  // set — same fixed/optional split EventDurationsModal already draws.
  const showDuration = isNew || (!isCheckboxType(eventType!.id) && !hasOptionalEnd(eventType!.id));

  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0].name);
  const [iconFamily, setIconFamily] = useState(ICON_OPTIONS[0].family);
  const [color, setColor] = useState(NEW_TYPE_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [minutes, setMinutes] = useState(DEFAULT_TYPE_MINUTES);
  const [goalId, setGoalId] = useState<string | undefined>(undefined);
  const [goalMode, setGoalMode] = useState<'count' | 'hours'>('count');
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const colorPicker = useEmbeddedColorPicker(colorPickerOpen, color);

  const sheetHeight = Math.min(
    colorPickerOpen ? SHEET_HEIGHT_COLOR : isCustom ? SHEET_HEIGHT_CUSTOM : SHEET_HEIGHT_BUILTIN,
    Math.round(height * 0.8),
  );

  useEffect(() => {
    if (!visible) return;
    setLabel(eventType?.label ?? '');
    setIcon(eventType?.icon ?? ICON_OPTIONS[0].name);
    setIconFamily(eventType?.iconFamily ?? ICON_OPTIONS[0].family);
    setColor(initialColor ?? NEW_TYPE_COLOR);
    setColorPickerOpen(false);
    setMinutes(initialMinutes ?? DEFAULT_TYPE_MINUTES);
    setGoalId(eventType?.goalId);
    setGoalMode(eventType?.goalMode ?? 'count');
    setGoalPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, eventType?.id]);

  const trimmed = label.trim();
  const canSave = !isCustom || trimmed.length > 0;
  const linkedGoal = availableGoals.find(g => g.id === goalId);

  function handleDone() {
    if (!canSave) return;
    onSave({
      label: isCustom ? trimmed : label,
      icon,
      iconFamily,
      color,
      defaultMinutes: minutes,
      goalId: isCustom ? goalId : undefined,
      goalMode,
    });
  }

  return (
    <BottomSheet
      visible={visible}
      title={colorPickerOpen ? 'Color' : isNew ? 'New Event Type' : eventType?.label}
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
          {isCustom && (
            <>
              <Text style={styles.pickerLabel}>Name</Text>
              <TextInput
                style={styles.nameInput}
                value={label}
                onChangeText={setLabel}
                placeholder="Event type name..."
                placeholderTextColor={Colors.textLight}
                returnKeyType="done"
              />

              <Text style={styles.pickerLabel}>Icon</Text>
              <IconPicker
                icon={icon}
                iconFamily={iconFamily}
                color={color}
                onSelect={opt => { setIcon(opt.name); setIconFamily(opt.family); }}
              />
            </>
          )}

          <Text style={styles.pickerLabel}>Color</Text>
          <ColorTrigger
            styles={styles}
            color={color}
            textLight={Colors.textLight}
            onPress={() => setColorPickerOpen(true)}
          />

          {showDuration && (
            <>
              <Text style={[styles.pickerLabel, { marginTop: 18 }]}>Default Duration</Text>
              <DurationSlider minutes={minutes} onChange={setMinutes} />
            </>
          )}

          {isCustom && (
            <>
              <Text style={[styles.pickerLabel, { marginTop: 18 }]}>Linked Goal</Text>
              <TouchableOpacity
                style={styles.linkTrigger}
                onPress={() => setGoalPickerOpen(v => !v)}
                activeOpacity={0.7}
              >
                {linkedGoal ? (
                  <View style={[styles.linkGoalDot, { backgroundColor: linkedGoal.color }]} />
                ) : (
                  <Ionicons name="close-circle-outline" size={16} color={Colors.textLight} style={{ marginRight: 8 }} />
                )}
                <Text style={styles.linkTriggerText}>{linkedGoal?.label ?? 'None'}</Text>
                <Ionicons name={goalPickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </TouchableOpacity>

              <Collapsible open={goalPickerOpen}>
                <View style={styles.linkList}>
                  <DropdownItem
                    label="None"
                    selected={goalId === undefined}
                    showSeparator={availableGoals.length > 0}
                    onPress={() => { setGoalId(undefined); setGoalPickerOpen(false); }}
                  />
                  {availableGoals.map((g, i, arr) => (
                    <DropdownItem
                      key={g.id}
                      label={g.label}
                      selected={goalId === g.id}
                      showSeparator={i < arr.length - 1}
                      leading={
                        <GoalIcon icon={g.icon} iconFamily={g.iconFamily} size={16} color={g.color} />
                      }
                      labelStyle={{ marginLeft: 8 }}
                      onPress={() => { setGoalId(g.id); setGoalPickerOpen(false); }}
                    />
                  ))}
                </View>
              </Collapsible>

              {goalId !== undefined && (
                <View style={styles.segmented}>
                  {(['count', 'hours'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.segment, goalMode === mode && styles.segmentActive]}
                      onPress={() => setGoalMode(mode)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.segmentText, goalMode === mode && styles.segmentTextActive]}>
                        {mode === 'count' ? 'Count (+1)' : 'Hours'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={{ height: 24 }} />
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
    scroll: { flex: 1 },
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
    linkTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: C.contactActionBg,
    },
    linkGoalDot: { width: 16, height: 16, borderRadius: 8, marginRight: 10 },
    linkTriggerText: { flex: 1, fontSize: 14, color: C.text },
    linkList: {
      marginTop: 4,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: C.menuSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.menuBorder,
    },
    segmented: {
      flexDirection: 'row',
      marginTop: 10,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: C.card,
    },
    segmentActive: {
      backgroundColor: C.control,
    },
    segmentText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
    segmentTextActive: { color: C.white },
  });
}
