import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert, View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { EventColors, DEFAULT_GOAL_COLOR } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalDefinition } from '../constants/defaultGoals';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { DurationSlider } from '../components/DurationSlider';
import { DropdownMenu, DropdownItem, MenuScrollView } from '../components/DropdownMenu';
import { useSettings } from '../hooks/useSettings';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { eventTypeColor, eventTypeDefaultMinutes } from '../utils/eventUtils';

/** What a type is called in the picker and the header while its name is blank. */
const UNTITLED = 'Untitled Event Type';

const DEFAULT_TYPE_MINUTES = 30;

// How many rows each menu shows before it scrolls. The half row is the point:
// a list cut mid-row says it continues, where a clean edge reads as the end.
const TYPE_MENU_ROWS = 6.5;
const GOAL_MENU_ROWS = 5.5;

/** Which floating menu is open. Both are on this one screen, so they share a slot. */
type MenuId = 'type' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: EventTypeDefinition[];
  onUpdateDefinitions: (defs: EventTypeDefinition[]) => Promise<void>;
  /** For the goal-link picker's candidate list — passed down from useWeeklyGoals(). */
  goalDefinitions: GoalDefinition[];
}

/**
 * One event type's fields, on one screen, with a dropdown at the top choosing
 * which type that is — the counterpart to EditGoalsModal, and rebuilt the
 * same way: the list-of-every-type plus a drilled-in `EditEventTypeSheet` is
 * now a selector and one set of live-editing fields.
 *
 * Every field edits live into `localDefs` (or, for colour and duration, into the
 * two pending settings maps below) and the lot is committed when the modal
 * closes. There is no sub-sheet to Cancel out of, so a Save button would only
 * ever be a way to lose an edit by switching the selector.
 */
export function EventTypesModal({ visible, onClose, definitions, onUpdateDefinitions, goalDefinitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings, updateSettings } = useSettings();
  const { events, deleteEventsOfType } = useCalendarEvents();

  const [localDefs, setLocalDefs] = useState<EventTypeDefinition[]>(definitions);
  // Colour and duration live in settings rather than on the definition, so they
  // get their own pending copies — one settings write on close, the same deal
  // localDefs has, rather than one per drag of the duration slider.
  const [localColors, setLocalColors] = useState<Record<string, string>>(settings.eventTypeColors);
  const [localMinutes, setLocalMinutes] = useState<Record<string, number>>(settings.eventTypeDefaultMinutes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [colorSheetOpen, setColorSheetOpen] = useState(false);

  /**
   * Which group wins the paint order. Lags `openMenu` on the way down and only
   * ever moves to the other menu, never back to null — see the matching state
   * in EditGoalsModal.
   */
  const [elevatedMenu, setElevatedMenu] = useState<MenuId | null>(null);
  useEffect(() => {
    if (openMenu) setElevatedMenu(openMenu);
  }, [openMenu]);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setLocalColors(settings.eventTypeColors);
      setLocalMinutes(settings.eventTypeDefaultMinutes);
      setSelectedId(definitions.find(d => !d.removed)?.id ?? null);
      setOpenMenu(null);
      setColorSheetOpen(false);
    }
  }, [visible]);

  const activeDefs = localDefs.filter(d => !d.removed);
  // Falls back to the first type so a delete, or a stale id, can never leave the
  // fields pointed at nothing while types still exist.
  const selected = activeDefs.find(d => d.id === selectedId) ?? activeDefs[0];

  // Edits are committed when the sheet closes — onClose fires first so the
  // slide-out starts immediately rather than waiting on the writes.
  function handleClose() {
    onClose();
    setOpenMenu(null);
    // A blank name is allowed while typing; nothing nameless is allowed to
    // persist, since the picker would then have a row you can't read.
    onUpdateDefinitions(localDefs.map(d => (
      d.removed || d.label.trim() ? d : { ...d, label: UNTITLED }
    )));
    // Only when something actually moved — these two start out as the very
    // objects settings holds, so an untouched visit writes nothing rather than
    // re-saving and re-syncing settings on every close.
    if (localColors !== settings.eventTypeColors || localMinutes !== settings.eventTypeDefaultMinutes) {
      updateSettings({
        eventTypeColors: localColors,
        eventTypeDefaultMinutes: localMinutes,
      });
    }
  }

  function toggleMenu(id: MenuId) {
    setOpenMenu(prev => (prev === id ? null : id));
  }

  function label(def: EventTypeDefinition): string {
    return def.label.trim() || UNTITLED;
  }

  /**
   * A goal icon's own tint — the same treatment the goal grid and the goal
   * editor give it, since dark mode can't draw a navy glyph on near-black.
   */
  function iconTint(color: string): string {
    return isDark ? lightenColor(color) : color;
  }

  /** Whether a type can be deleted right now — false while any calendar event still uses it. */
  function typeInUse(id: string): boolean {
    return events.some(e => e.type === id);
  }

  function patchType(id: string, patch: Partial<EventTypeDefinition>) {
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  /**
   * A new type is appended and selected straight away rather than drafted:
   * every other field here edits live, and a draft would need the Save/Cancel
   * pair the selector was meant to replace.
   */
  function addType() {
    const id = `custom_evt_${Date.now()}`;
    setLocalDefs(prev => [...prev, {
      id,
      label: '',
      builtIn: false,
      reportStyle: 'status',
    }]);
    setLocalColors(prev => ({ ...prev, [id]: DEFAULT_GOAL_COLOR }));
    setLocalMinutes(prev => ({ ...prev, [id]: DEFAULT_TYPE_MINUTES }));
    setSelectedId(id);
    setOpenMenu(null);
  }

  /** Moves the selector off a type that's about to be tombstoned. */
  function selectNeighbourOf(id: string) {
    const index = activeDefs.findIndex(d => d.id === id);
    const next = activeDefs[index + 1] ?? activeDefs[index - 1];
    setSelectedId(next?.id ?? null);
  }

  /** Tombstones rather than removes the array entry — see EventTypeDefinition.removed. */
  function handleDeletePress() {
    if (!selected) return;
    const id = selected.id;
    const name = label(selected);
    const usage = events.filter(e => e.type === id).length;

    if (typeInUse(id)) {
      Alert.alert(
        'Delete Event Type',
        `There ${usage === 1 ? 'is' : 'are'} still ${usage} event${usage === 1 ? '' : 's'} of "${name}" in your calendar. Would you like to delete them all and delete the event type?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete All',
            style: 'destructive',
            onPress: async () => {
              await deleteEventsOfType(id);
              selectNeighbourOf(id);
              patchType(id, { removed: true });
            },
          },
        ],
        { cancelable: true },
      );
      return;
    }

    Alert.alert(
      `Delete "${name}"?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            selectNeighbourOf(id);
            patchType(id, { removed: true });
          },
        },
      ],
      { cancelable: true },
    );
  }

  // A goal/type can have at most one link. The picker only offers goals with no
  // existing link, plus whichever one is currently linked to the selected type.
  const availableGoals = goalDefinitions.filter(g => {
    // A type deleted this session doesn't hold its goal hostage — its tombstone
    // keeps the goalId, but the link is gone with it.
    const claimedElsewhere = localDefs.some(d => !d.removed && d.goalId === g.id && d.id !== selected?.id);
    return !claimedElsewhere;
  });
  const linkedGoal = availableGoals.find(g => g.id === selected?.goalId);

  const color = selected ? eventTypeColor(selected.id, localColors) : DEFAULT_GOAL_COLOR;
  // Checkbox types (task) and optional-end types (contact) have no duration to
  // set — eventTypeDefaultMinutes returns null for those.
  const minutes = selected ? eventTypeDefaultMinutes(selected.id, localMinutes) : null;
  const goalMode = selected?.goalMode ?? 'count';
  const reportStyle = selected?.reportStyle ?? 'status';

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Types</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {/* Dismisses whichever menu is open on a tap outside it — ranked under
            the elevated group only, so the open menu and its own trigger stay
            live while everything else just closes it. */}
        {openMenu !== null && (
          <Pressable style={styles.pickerBackdrop} onPress={() => setOpenMenu(null)} />
        )}

        {/* Which type every field below belongs to. Its own group, lifted over
            the cards that follow while its menu is out. */}
        <View style={elevatedMenu === 'type' && styles.groupFloating}>
          <Text style={styles.sectionLabel}>EVENT TYPE</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedMenu === 'type' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleMenu('type')}
                activeOpacity={0.7}
              >
                {selected && <View style={[styles.rowDot, { backgroundColor: color }]} />}
                <Text style={[styles.rowTitle, !selected && styles.rowTitleEmpty]} numberOfLines={1}>
                  {selected ? label(selected) : 'No event types'}
                </Text>
                <Ionicons
                  name={openMenu === 'type' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              {/* Types only — picking which one to edit. Adding one is the
                  link under the fields, not a row in here. */}
              <DropdownMenu open={openMenu === 'type'}>
                <MenuScrollView
                  open={openMenu === 'type'}
                  selectedIndex={activeDefs.findIndex(d => d.id === selected?.id)}
                  maxRows={TYPE_MENU_ROWS}
                >
                  {activeDefs.map((def, i, arr) => (
                    <DropdownItem
                      key={def.id}
                      label={label(def)}
                      selected={def.id === selected?.id}
                      showSeparator={i < arr.length - 1}
                      leading={<View style={[styles.rowDot, { marginRight: 0, backgroundColor: eventTypeColor(def.id, localColors) }]} />}
                      labelStyle={{ marginLeft: 8 }}
                      onPress={() => { setSelectedId(def.id); setOpenMenu(null); }}
                    />
                  ))}
                </MenuScrollView>
              </DropdownMenu>
            </View>
          </View>
        </View>

        {selected ? (
          <>
            {/* Every field in one card — what identifies and links this type,
                then how it behaves. A group of its own so the goal menu, which
                can reach past the card's bottom edge, floats over the delete
                link below rather than painting behind it. */}
            <View style={elevatedMenu === 'goal' && styles.groupFloating}>
              <View style={[styles.card, { marginTop: 18 }]}>
                <View style={styles.section}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <View style={styles.nameField}>
                    <TextInput
                      style={styles.nameInput}
                      value={selected.label}
                      onChangeText={text => patchType(selected.id, { label: text })}
                      onFocus={() => setOpenMenu(null)}
                      placeholder="Event type name..."
                      placeholderTextColor={Colors.textLight}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setOpenMenu(null); setColorSheetOpen(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Color</Text>
                  <View style={[styles.rowDot, { marginRight: 0, backgroundColor: color }]} />
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* The row's own positioned parent — DropdownMenu anchors to it,
                    and its zIndex keeps the open menu above Goal Count Type
                    below rather than under it, both inside this same card. */}
                <View style={[styles.fieldRow, elevatedMenu === 'goal' && styles.fieldRowOpen]}>
                  {/* Keeps its hairline whether or not Goal Count Type follows —
                      Status Type comes after either way, now that all of this is
                      one card. */}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => toggleMenu('goal')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rowLabel}>Linked Goal</Text>
                    {/* The goal's own icon in its own colour, the way the grid
                        and the goal editor draw it — a bare dot said which
                        colour it was and nothing about which goal. */}
                    {linkedGoal && (
                      <View style={[styles.goalIcon, { backgroundColor: isDark ? linkedGoal.color : linkedGoal.color + '20' }]}>
                        <GoalIcon icon={linkedGoal.icon} iconFamily={linkedGoal.iconFamily} size={15} color={iconTint(linkedGoal.color)} />
                      </View>
                    )}
                    <Text style={styles.rowValue}>{linkedGoal?.label ?? 'None'}</Text>
                    <Ionicons
                      name={openMenu === 'goal' ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>

                  <DropdownMenu open={openMenu === 'goal'}>
                    <MenuScrollView
                      open={openMenu === 'goal'}
                      // None is row 0, so every goal sits one further down.
                      selectedIndex={selected.goalId ? 1 + availableGoals.findIndex(g => g.id === selected.goalId) : 0}
                      maxRows={GOAL_MENU_ROWS}
                    >
                      <DropdownItem
                        label="None"
                        selected={selected.goalId === undefined}
                        showSeparator={availableGoals.length > 0}
                        onPress={() => {
                          patchType(selected.id, { goalId: undefined, goalMode: undefined });
                          setOpenMenu(null);
                        }}
                      />
                      {availableGoals.map((g, i, arr) => (
                        <DropdownItem
                          key={g.id}
                          label={g.label}
                          selected={selected.goalId === g.id}
                          showSeparator={i < arr.length - 1}
                          leading={<GoalIcon icon={g.icon} iconFamily={g.iconFamily} size={17} color={iconTint(g.color)} />}
                          labelStyle={{ marginLeft: 10 }}
                          onPress={() => {
                            // A link needs a mode; keep whatever this type
                            // already had rather than resetting it on a re-link.
                            patchType(selected.id, { goalId: g.id, goalMode: selected.goalMode ?? 'count' });
                            setOpenMenu(null);
                          }}
                        />
                      ))}
                    </MenuScrollView>
                  </DropdownMenu>
                </View>

                {selected.goalId !== undefined && (
                  <View style={styles.section}>
                    <Text style={styles.fieldLabel}>Goal Count Type</Text>
                    <View style={styles.segmentTrack}>
                      {(['count', 'hours', 'quantity'] as const).map(mode => (
                        <TouchableOpacity
                          key={mode}
                          style={[styles.segment, goalMode === mode && styles.segmentActive]}
                          onPress={() => patchType(selected.id, { goalMode: mode })}
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

                {/* Independent of whether this type is linked to a goal — it just
                    decides whether/how completing an event of this type shows a
                    status control at all. Linking separately decides whether that
                    status also feeds a goal. */}
                <View style={[styles.section, minutes === null && styles.sectionLast]}>
                  <Text style={styles.fieldLabel}>Status Type</Text>
                  <View style={styles.segmentTrack}>
                    {(['checkbox', 'status', 'none'] as const).map(style => (
                      <TouchableOpacity
                        key={style}
                        style={[styles.segment, reportStyle === style && styles.segmentActive]}
                        onPress={() => patchType(selected.id, { reportStyle: style })}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.segmentText, reportStyle === style && styles.segmentTextActive]}>
                          {style === 'checkbox' ? 'Checkbox' : style === 'status' ? 'Status' : 'None'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {minutes !== null && (
                  <View style={[styles.section, styles.sectionLast]}>
                    <Text style={styles.fieldLabel}>Default Duration</Text>
                    <DurationSlider
                      minutes={minutes}
                      onChange={next => setLocalMinutes(prev => ({ ...prev, [selected.id]: next }))}
                    />
                  </View>
                )}
              </View>
            </View>

          </>
        ) : (
          <Text style={styles.emptyHint}>Add an event type to start scheduling one.</Text>
        )}

        {/* Above the delete row, not below it: adding is the ordinary thing to
            do here and deleting is the exception, so the destructive action is
            the last thing on the page rather than something to scroll past. */}
        <TouchableOpacity onPress={addType} style={styles.addBtn} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={Colors.white} />
          <Text style={styles.addBtnText}>Add an Event Type</Text>
        </TouchableOpacity>

        {!!selected && (
          <TouchableOpacity style={styles.deleteRow} onPress={handleDeletePress} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={styles.deleteRowText}>Delete Event Type</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* A Modal of its own, so it layers over this sheet rather than being
          clipped by it — and unlike the rows behind it, it holds a draft until
          Done, which is what its Cancel means. */}
      <ColorPickerSheet
        visible={colorSheetOpen && !!selected}
        color={color}
        title={selected ? label(selected) : undefined}
        defaultColor={selected?.builtIn ? EventColors[selected.id] : undefined}
        onCancel={() => setColorSheetOpen(false)}
        onDone={hex => {
          if (selected) setLocalColors(prev => ({ ...prev, [selected.id]: hex }));
          setColorSheetOpen(false);
        }}
      />
    </SheetModal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
    closeBtn: { width: 44, alignItems: 'flex-start' },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    // Lifts a card and its heading, as one unit, above the cards that follow —
    // siblings with equal zIndex stack in document order, so a later card would
    // otherwise paint over a menu floating out of an earlier one.
    groupFloating: { zIndex: 2 },
    // A trigger's wrapper needs a higher zIndex than the sibling rows beneath
    // it inside the same card. Both are driven by `elevatedMenu`, not
    // `openMenu` — see that state's comment.
    fieldRow: { zIndex: 20 },
    fieldRowOpen: { zIndex: 30 },
    // Dismisses whichever menu is open on an outside tap. Covers the full
    // scroll content rather than just the viewport, so bottom: 0 anchors to the
    // content container's edge.
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    // No overflow:'hidden' clip on purpose: the two menus have to reach past
    // their card's bottom edge, and nothing inside carries a background of its
    // own that would need clipping to the rounded corners without one.
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    // A card row holding a control block (input, segmented control, slider)
    // rather than a label-and-value line — same horizontal rhythm as `row`.
    section: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    sectionLast: {
      borderBottomWidth: 0,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      marginBottom: 10,
    },
    // A recessed fill, same device the segmented control's track uses below, so
    // the field reads as something to tap into rather than a static label.
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
    // The linked goal's icon on its own tinted disc, as the goal grid draws it.
    // In dark mode the disc takes the goal's full colour and the glyph lightens
    // off it, since a 20%-alpha wash of anything on near-black is invisible.
    goalIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    // The selector's own row: the type's name is the row's subject, not a value
    // hanging off a label, so it takes the weight a rowLabel would.
    rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text },
    rowTitleEmpty: { fontWeight: '500', color: C.textLight },
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
    emptyHint: {
      marginTop: 24,
      textAlign: 'center',
      fontSize: 14,
      color: C.textSecondary,
    },
    /**
     * A filled button rather than the ＋-and-label link this was, matching
     * EditGoalsModal's — the two sheets are the same sheet about different
     * things, and this is the one action in either that isn't editing what's
     * already there.
     *
     * `goalActionBg`, not `control`: this needs a white label, and `control` is
     * a pale blue in dark mode, which white sits on badly. That token is dark in
     * both themes for exactly this.
     */
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      // Tight to the label, and less padding on the ＋'s side than the label's:
      // the glyph carries whitespace inside its own box, so equal padding reads
      // as a gap on the left.
      gap: 4,
      marginTop: 26,
      paddingLeft: 14,
      paddingRight: 20,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: C.goalActionBg,
    },
    addBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: C.white,
    },
    deleteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      // 22 when this sat under the card, where it needed to stand clear of a
      // whole block of fields. It now follows the add button, which is one
      // control, so it only needs to not look attached to it.
      marginTop: 16,
      paddingVertical: 10,
    },
    deleteRowText: {
      fontSize: 14,
      fontWeight: '600',
      color: C.danger,
    },
  });
}
