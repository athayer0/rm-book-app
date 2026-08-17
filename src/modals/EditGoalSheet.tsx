import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { IconPicker, ICON_OPTIONS } from '../components/IconPicker';
import { GoalIcon } from '../components/GoalIcon';
import { ColorPickerBody, useColorPickerStyles, useEmbeddedColorPicker } from '../components/ColorPickerSheet';
import { BottomSheet } from '../components/BottomSheet';
import { DropdownMenu, DropdownItem, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { eventTypeColor } from '../utils/eventUtils';

/** Where a new goal's colour starts before the picker is touched. */
const NEW_GOAL_COLOR = DEFAULT_GOAL_COLOR;

// Header, the fields, nothing that grows — so, like DurationSheet, the sheet
// is a fixed height rather than measured.
const SHEET_HEIGHT = 460;
// The color step swaps in ColorPickerBody, which wants roughly the same room
// ColorPickerSheet gives it on its own — see that file's own sheetHeight.
const SHEET_HEIGHT_COLOR = 420;
// The icon step swaps in a grid of every icon on offer — same room as the
// color step, since both replace the whole form with one full-page picker.
const SHEET_HEIGHT_ICON = 420;
// A handful of event types fit without scrolling; past that the menu caps
// out and scrolls internally rather than reaching past the sheet's own
// bottom edge — see EditEventTypeSheet's matching constant.
const TYPE_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 5.5;

export interface GoalDraft {
  label: string;
  icon: string;
  iconFamily: string;
  color: string;
  /** The event type whose completions feed this goal. */
  eventTypeId?: string;
}

interface Props {
  visible: boolean;
  /** The goal being edited, or undefined when the sheet is creating a new one. */
  goal?: GoalDefinition;
  /** Built-ins only: the stock color to offer as a way back. */
  defaultColor?: string;
  /** Event types with no linked goal, plus whichever one links to this goal. */
  availableEventTypes: EventTypeDefinition[];
  /** Event type colors live in settings, not on the definition — passed down from useSettings() in the parent. */
  eventTypeColors: Record<string, string>;
  /** False while an event type still links to this goal — delete is blocked until it's unlinked. */
  canDelete: boolean;
  onCancel: () => void;
  onSave: (draft: GoalDraft) => void;
  onDelete: () => void;
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
 * The colour picker, and the icon grid, are each a *step* within this same
 * sheet (`colorPickerOpen` / `iconPickerOpen` driving the BottomSheet's own
 * title/Cancel/Done) rather than a second BottomSheet opened on top of this
 * one. Two native Modals stacked on top of this list's own SheetModal — three
 * deep in all — is what used to make tapping Color do nothing and leave the
 * app stuck: see the comment on `useEmbeddedColorPicker`. The icon step has
 * no equivalent "embedded" hook since picking is instant — there's no draft
 * to carry between renders the way a dragged colour needs one.
 */
export function EditGoalSheet({
  visible, goal, defaultColor, availableEventTypes, eventTypeColors, canDelete, onCancel, onSave, onDelete,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { styles: colorStyles } = useColorPickerStyles();
  const { height } = useWindowDimensions();

  const isNew = !goal;

  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(ICON_OPTIONS[0].name);
  const [iconFamily, setIconFamily] = useState(ICON_OPTIONS[0].family);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [color, setColor] = useState(NEW_GOAL_COLOR);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [eventTypeId, setEventTypeId] = useState<string | undefined>(undefined);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const colorPicker = useEmbeddedColorPicker(colorPickerOpen, color);

  const sheetHeight = Math.min(
    iconPickerOpen ? SHEET_HEIGHT_ICON : colorPickerOpen ? SHEET_HEIGHT_COLOR : SHEET_HEIGHT,
    Math.round(height * 0.7),
  );

  useEffect(() => {
    if (!visible) return;
    setLabel(goal?.label ?? '');
    setIcon(goal?.icon ?? ICON_OPTIONS[0].name);
    setIconFamily(goal?.iconFamily ?? ICON_OPTIONS[0].family);
    setIconPickerOpen(false);
    setColor(goal?.color ?? NEW_GOAL_COLOR);
    setColorPickerOpen(false);
    setEventTypeId(goal ? availableEventTypes.find(t => t.goalId === goal.id)?.id : undefined);
    setTypePickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, goal?.id]);

  const trimmed = label.trim();
  const canSave = trimmed.length > 0;
  const linkedType = availableEventTypes.find(t => t.id === eventTypeId);

  function handleDone() {
    if (!canSave) return;
    onSave({ label: trimmed, icon, iconFamily, color, eventTypeId });
  }

  function handleDeletePress() {
    if (!goal) return;
    if (!canDelete) {
      const linkedTypeLabel = availableEventTypes.find(t => t.goalId === goal.id)?.label ?? 'an event type';
      Alert.alert(
        'Linked to an Event Type',
        `"${goal.label}" is linked to ${linkedTypeLabel}. Set its Linked Event Type to None and save, then delete this goal.`,
      );
      return;
    }
    Alert.alert(
      `Delete "${goal.label}"?`,
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
      title={iconPickerOpen ? 'Icon' : colorPickerOpen ? 'Color' : isNew ? 'New Goal' : goal?.label}
      height={sheetHeight}
      // The Name field sits at the top of the sheet, well clear of the
      // keyboard — see EditEventTypeSheet's matching prop.
      avoidKeyboard={false}
      onCancel={iconPickerOpen ? () => setIconPickerOpen(false) : colorPickerOpen ? () => setColorPickerOpen(false) : onCancel}
      onDone={
        iconPickerOpen ? () => setIconPickerOpen(false)
        : colorPickerOpen ? () => { setColor(colorPicker.draft); setColorPickerOpen(false); }
        : handleDone
      }
    >
      {iconPickerOpen ? (
        <ScrollView style={styles.iconContent} contentContainerStyle={styles.iconContentInner} bounces={false}>
          <IconPicker
            icon={icon}
            iconFamily={iconFamily}
            color={color}
            // Stays open on a tap — picking is easy to second-guess sitting
            // next to twenty-nine near-identical cells, so selecting updates
            // the choice in place rather than immediately navigating away
            // from the grid it was just compared against.
            onSelect={opt => { setIcon(opt.name); setIconFamily(opt.family); }}
          />
        </ScrollView>
      ) : colorPickerOpen ? (
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
          {/* Dismisses the event-type picker on a tap anywhere outside it —
              see EditEventTypeSheet's matching backdrop. */}
          {typePickerOpen && (
            <Pressable style={styles.pickerBackdrop} onPress={() => setTypePickerOpen(false)} />
          )}

          {/* Name, in its own recessed field — same device EditEventTypeSheet
              uses, so a plain line of text doesn't read as a static label. */}
          <View style={styles.card}>
            <View style={[styles.section, styles.sectionLast]}>
              <Text style={styles.sectionLabel}>Name</Text>
              <View style={styles.nameField}>
                <TextInput
                  style={styles.nameInput}
                  value={label}
                  onChangeText={setLabel}
                  onFocus={() => setTypePickerOpen(false)}
                  placeholder="Goal name..."
                  placeholderTextColor={Colors.textLight}
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          {/* Icon, Color, and Linked Event Type — a Settings-style card of
              stacked rows. Icon now opens the same kind of full-page step
              Color does (see IconPicker), rather than an inline scroll strip
              that hid most of the set behind a scroll. Raised above the
              backdrop and above nothing else follows it, so the event-type
              menu — which reaches past this card's own bottom edge — floats
              over the delete link below rather than pushing it down. */}
          <View style={[styles.card, styles.cardElevated, { marginTop: 18 }]}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => { setTypePickerOpen(false); setIconPickerOpen(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>Icon</Text>
              <View style={styles.iconPreview}>
                <GoalIcon icon={icon} iconFamily={iconFamily} size={18} color={color} />
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              onPress={() => { setTypePickerOpen(false); setColorPickerOpen(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>Color</Text>
              <View style={[styles.rowDot, { marginRight: 0, backgroundColor: color }]} />
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            {/* The row's own positioned parent — DropdownMenu anchors to it. */}
            <View>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => setTypePickerOpen(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>Linked Event Type</Text>
                {linkedType && (
                  <View style={[styles.rowDot, { backgroundColor: eventTypeColor(linkedType.id, eventTypeColors) }]} />
                )}
                <Text style={styles.rowValue}>{linkedType?.label ?? 'None'}</Text>
                <Ionicons
                  name={typePickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              <DropdownMenu open={typePickerOpen}>
                <ScrollView
                  style={{ maxHeight: TYPE_LIST_MAX_HEIGHT }}
                  nestedScrollEnabled
                  bounces={false}
                  overScrollMode="never"
                >
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
                      leading={<View style={[styles.rowDot, { marginRight: 0, backgroundColor: eventTypeColor(t.id, eventTypeColors) }]} />}
                      labelStyle={{ marginLeft: 8 }}
                      onPress={() => { setEventTypeId(t.id); setTypePickerOpen(false); }}
                    />
                  ))}
                </ScrollView>
              </DropdownMenu>
            </View>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteRow} onPress={handleDeletePress} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={styles.deleteRowText}>Delete Goal</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </BottomSheet>
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
    // The icon step just wraps IconPicker's own grid — a ScrollView rather
    // than a bare View since the grid's height isn't capped to the sheet's,
    // and a small device could otherwise clip the last row.
    iconContent: { flex: 1 },
    iconContentInner: { padding: 16 },
    // A card row that holds a control (the Name field) rather than a
    // label-and-value line — same rhythm as `row` below, its own hairline
    // unless it's the last thing in the card.
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
    // A recessed fill, matching EditEventTypeSheet's Name field and the
    // segmented control's own track — reads as something to tap into rather
    // than a static label.
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
    // The Icon row's trailing preview — a small swatch behind the glyph, the
    // same device rowDot uses for a colour, sized to sit level with it.
    iconPreview: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Name, Icon, Color, and Linked Event Type all live in one of these two
    // grouped cards — Settings' own card-of-rows idiom. No overflow:'hidden'
    // clip: nothing inside carries a background of its own that needs
    // clipping to the rounded corners.
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    // Only the Icon/Color/Linked Event Type card needs this — see the
    // comment where it's applied.
    cardElevated: { zIndex: 20 },
    // Dismisses the event-type picker on a tap outside its own elevated
    // card — transparent, and ranked between the two cards so it still lets
    // taps on the elevated one through. See AddEditEventModal's
    // pickerBackdrop for the same shape.
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
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
