import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalDefinition } from '../constants/defaultGoals';
import { ColorPickerBody, useColorPickerStyles, useEmbeddedColorPicker } from '../components/ColorPickerSheet';
import { BottomSheet } from '../components/BottomSheet';
import { DurationSlider } from '../components/DurationSlider';
import { DropdownMenu, DropdownItem, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { isCheckboxType, hasOptionalEnd } from '../utils/eventUtils';

const NEW_TYPE_COLOR = DEFAULT_GOAL_COLOR;
const DEFAULT_TYPE_MINUTES = 30;

// Taller than EditGoalSheet's sheets: on top of name/icon/color this one also
// carries a duration slider and the goal-link picker.
const SHEET_HEIGHT = 620;
// The color step swaps in ColorPickerBody, which wants roughly the same room
// ColorPickerSheet gives it on its own — see that file's own sheetHeight.
const SHEET_HEIGHT_COLOR = 420;
// A handful of goals fit without scrolling; past that the menu caps out and
// scrolls internally rather than reaching past the sheet's own bottom edge.
const GOAL_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 5.5;

export interface EventTypeDraft {
  label: string;
  color: string;
  defaultMinutes: number;
  goalId?: string;
  goalMode: 'count' | 'hours' | 'quantity';
  reportStyle: 'checkbox' | 'status' | 'none';
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
  /** Goals with no linked type, plus whichever one is currently linked to this type. */
  availableGoals: GoalDefinition[];
  /** False while any calendar event still uses this type — gates which confirm dialog delete shows. */
  canDelete: boolean;
  /** How many calendar events currently use this type, for the in-use confirm message. */
  usageCount: number;
  onCancel: () => void;
  onSave: (draft: EventTypeDraft) => void;
  onDelete: () => void;
  /** Deletes every calendar event of this type, then the type itself. */
  onDeleteAll: () => void;
}

/**
 * A single event type's name/icon/color/duration/goal-link, in one sheet —
 * mirrors EditGoalSheet's shape. Every field is editable for both built-in
 * and custom types.
 *
 * The colour picker is a *step* within this same sheet (see `colorPickerOpen`
 * below driving the BottomSheet's own title/Cancel/Done), not a second
 * BottomSheet opened on top of this one — see the comment on
 * `useEmbeddedColorPicker` for why stacking a third native Modal there used to
 * freeze the app.
 */
export function EditEventTypeSheet({
  visible, eventType, color: initialColor, defaultMinutes: initialMinutes, defaultColor,
  availableGoals, canDelete, usageCount, onCancel, onSave, onDelete, onDeleteAll,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { styles: colorStyles } = useColorPickerStyles();
  const { height } = useWindowDimensions();

  const isNew = !eventType;
  // Checkbox types (task) and optional-end types (contact) have no duration
  // to set.
  const showDuration = isNew || (!isCheckboxType(eventType!.id) && !hasOptionalEnd(eventType!.id));

  const [label, setLabel] = useState('');
  const [color, setColor] = useState(NEW_TYPE_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [minutes, setMinutes] = useState(DEFAULT_TYPE_MINUTES);
  const [goalId, setGoalId] = useState<string | undefined>(undefined);
  const [goalMode, setGoalMode] = useState<'count' | 'hours' | 'quantity'>('count');
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [reportStyle, setReportStyle] = useState<'checkbox' | 'status' | 'none'>('status');
  const colorPicker = useEmbeddedColorPicker(colorPickerOpen, color);

  const sheetHeight = Math.min(
    colorPickerOpen ? SHEET_HEIGHT_COLOR : SHEET_HEIGHT,
    Math.round(height * 0.8),
  );

  useEffect(() => {
    if (!visible) return;
    setLabel(eventType?.label ?? '');
    setColor(initialColor ?? NEW_TYPE_COLOR);
    setColorPickerOpen(false);
    setMinutes(initialMinutes ?? DEFAULT_TYPE_MINUTES);
    setGoalId(eventType?.goalId);
    setGoalMode(eventType?.goalMode ?? 'count');
    setGoalPickerOpen(false);
    setReportStyle(eventType?.reportStyle ?? 'status');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, eventType?.id]);

  const trimmed = label.trim();
  const canSave = trimmed.length > 0;
  const linkedGoal = availableGoals.find(g => g.id === goalId);

  function handleDone() {
    if (!canSave) return;
    onSave({ label: trimmed, color, defaultMinutes: minutes, goalId, goalMode, reportStyle });
  }

  function handleDeletePress() {
    if (!eventType) return;
    if (!canDelete) {
      Alert.alert(
        'Delete Event Type',
        `There ${usageCount === 1 ? 'is' : 'are'} still ${usageCount} event${usageCount === 1 ? '' : 's'} of "${eventType.label}" in your calendar. Would you like to delete them all and delete the event type?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete All', style: 'destructive', onPress: onDeleteAll },
        ],
        { cancelable: true },
      );
      return;
    }
    Alert.alert(
      `Delete "${eventType.label}"?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
      { cancelable: true },
    );
  }

  return (
    <BottomSheet
      visible={visible}
      title={colorPickerOpen ? 'Color' : isNew ? 'New Event Type' : eventType?.label}
      height={sheetHeight}
      // The Name field sits at the very top of the sheet, well clear of the
      // keyboard, and this sheet holds a floating DropdownMenu — riding the
      // whole sheet up would drag the menu's anchor row out from under it
      // mid-open. Nothing here needs the keyboard-avoidance shift.
      avoidKeyboard={false}
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
          {/* Dismisses the goal picker on a tap anywhere outside it — same
              backdrop-under-the-elevated-card trick AddEditEventModal's
              floating pickers use, so a stray tap doesn't act on whatever's
              underneath as well as closing the menu. */}
          {goalPickerOpen && (
            <Pressable style={styles.pickerBackdrop} onPress={() => setGoalPickerOpen(false)} />
          )}

          {/* Name, then Color and Linked Goal right beneath it — what
              identifies and links this type, ahead of how it behaves below.
              Raised above the card and backdrop that follow so the goal
              picker's menu, which reaches past this card's own bottom edge,
              floats over them instead of painting behind. */}
          <View style={[styles.card, styles.cardElevated]}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Name</Text>
              <View style={styles.nameField}>
                <TextInput
                  style={styles.nameInput}
                  value={label}
                  onChangeText={setLabel}
                  onFocus={() => setGoalPickerOpen(false)}
                  placeholder="Event type name..."
                  placeholderTextColor={Colors.textLight}
                  returnKeyType="done"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.row}
              onPress={() => { setGoalPickerOpen(false); setColorPickerOpen(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>Color</Text>
              <View style={[styles.rowDot, { marginRight: 0, backgroundColor: color }]} />
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            {/* The row's own positioned parent — DropdownMenu anchors to it,
                and its zIndex keeps the open menu above Goal Count Type below
                rather than under it, both inside this same card. */}
            <View style={styles.dropdownAnchor}>
              <TouchableOpacity
                style={[styles.row, goalId === undefined && styles.rowLast]}
                onPress={() => setGoalPickerOpen(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>Linked Goal</Text>
                {linkedGoal && <View style={[styles.rowDot, { backgroundColor: linkedGoal.color }]} />}
                <Text style={styles.rowValue}>{linkedGoal?.label ?? 'None'}</Text>
                <Ionicons
                  name={goalPickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              <DropdownMenu open={goalPickerOpen}>
                <ScrollView
                  style={{ maxHeight: GOAL_LIST_MAX_HEIGHT }}
                  nestedScrollEnabled
                  bounces={false}
                  overScrollMode="never"
                >
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
                      leading={<View style={[styles.rowDot, { marginRight: 0, backgroundColor: g.color }]} />}
                      labelStyle={{ marginLeft: 8 }}
                      onPress={() => { setGoalId(g.id); setGoalPickerOpen(false); }}
                    />
                  ))}
                </ScrollView>
              </DropdownMenu>
            </View>

            {goalId !== undefined && (
              <View style={[styles.section, styles.sectionLast]}>
                <Text style={styles.sectionLabel}>Goal Count Type</Text>
                <View style={styles.segmentTrack}>
                  {(['count', 'hours', 'quantity'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.segment, goalMode === mode && styles.segmentActive]}
                      onPress={() => setGoalMode(mode)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.segmentText, goalMode === mode && styles.segmentTextActive]}>
                        {mode === 'count' ? 'Completion' : mode === 'hours' ? 'Hours' : 'Quantity'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Status Type, and (when there's one to set) Default Duration —
              how the type behaves, separate from what identifies and links
              it above. */}
          <View style={[styles.card, { marginTop: 18 }]}>
            {/* Independent of whether this type is linked to a goal — it just
                decides whether/how completing an event of this type shows a
                status control at all. Linking separately decides whether that
                status also feeds a goal. */}
            <View style={[styles.section, !showDuration && styles.sectionLast]}>
              <Text style={styles.sectionLabel}>Status Type</Text>
              <View style={styles.segmentTrack}>
                {(['checkbox', 'status', 'none'] as const).map(style => (
                  <TouchableOpacity
                    key={style}
                    style={[styles.segment, reportStyle === style && styles.segmentActive]}
                    onPress={() => setReportStyle(style)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.segmentText, reportStyle === style && styles.segmentTextActive]}>
                      {style === 'checkbox' ? 'Checkbox' : style === 'status' ? 'Status' : 'None'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {showDuration && (
              <View style={[styles.section, styles.sectionLast]}>
                <Text style={styles.sectionLabel}>Default Duration</Text>
                <DurationSlider minutes={minutes} onChange={setMinutes} />
              </View>
            )}
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteRow} onPress={handleDeletePress} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={styles.deleteRowText}>Delete Event Type</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </BottomSheet>
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
    // Every field lives in one of two grouped cards now — Settings' own
    // card-of-rows idiom — rather than a mix of bare labelled controls and a
    // single card. No overflow:'hidden' clip on purpose: the goal picker's
    // floating menu has to reach past this card's bottom edge, and none of
    // the rows inside carry a background of their own that would need
    // clipping to the rounded corners without one.
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    // Only the Name/Color/Linked Goal card needs this — see the comment where
    // it's applied.
    cardElevated: { zIndex: 20 },
    dropdownAnchor: { zIndex: 5 },
    // A section is a card row that holds a control block (input, segmented
    // control, slider) rather than a label-and-value line — same horizontal
    // rhythm as `row` below, its own hairline unless it's the last in the card.
    section: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    sectionLast: {
      borderBottomWidth: 0,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      marginBottom: 10,
    },
    // A recessed fill, same device the segmented control's track uses below,
    // so the field reads as something to tap into rather than a static label
    // — a bare line of text at this size gave no hint it was editable.
    nameField: {
      backgroundColor: C.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    nameInput: {
      fontSize: 16,
      color: C.text,
      padding: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowLabel: { flex: 1, fontSize: 15, color: C.text },
    rowValue: { fontSize: 14, color: C.textSecondary },
    rowDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
    // An iOS-style segmented control: a recessed track (the app's own
    // `background`, distinct from the card it sits on) holding a pill that
    // rises back to `card` level with its own small shadow when selected,
    // rather than a flat bordered strip with a solid colour fill.
    segmentTrack: {
      flexDirection: 'row',
      backgroundColor: C.background,
      borderRadius: 9,
      padding: 2,
    },
    segment: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 7,
      alignItems: 'center',
    },
    segmentActive: {
      backgroundColor: C.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
    segmentTextActive: { color: C.text },
    // Dismisses the goal picker on a tap outside its own elevated card —
    // transparent, and ranked between the two cards so it still lets taps on
    // the elevated one through. See AddEditEventModal's pickerBackdrop for
    // the same shape.
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
    },
    deleteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 22,
      paddingVertical: 10,
    },
    deleteRowText: {
      fontSize: 14,
      fontWeight: '600',
      color: C.danger,
    },
  });
}
