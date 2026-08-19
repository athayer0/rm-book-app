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
import { DEFAULT_GOAL_SPLIT_TIME, EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalDefinition } from '../constants/defaultGoals';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { DurationSlider } from '../components/DurationSlider';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { DropdownMenu, DropdownItem, MenuScrollView, Collapsible } from '../components/DropdownMenu';
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

/**
 * Which floating menu is open. All three are on this one screen, so they share a
 * slot. The cutoff's time wheel isn't one of them: it opens in the flow rather
 * than floating, and keeping it out of here is what lets `elevatedMenu` keep
 * lagging — opening the wheel closes the goal menu, and the group has to stay
 * lifted through that menu's exit.
 */
type MenuId = 'type' | 'goal' | 'lateGoal';

/**
 * The Goal Count Type control's four choices. Three of them are the stored
 * `goalMode`; Day/Night is not a fourth way of measuring but a completion goal
 * that divides at a time of day, so it maps onto mode 'count' plus a
 * `goalSplitTime` — see EventTypeDefinition.goalSplitTime.
 */
type CountChoice = 'count' | 'hours' | 'quantity' | 'dayNight';

const COUNT_CHOICES: CountChoice[] = ['count', 'hours', 'quantity', 'dayNight'];

const COUNT_CHOICE_LABEL: Record<CountChoice, string> = {
  count: 'Completion',
  hours: 'Hours',
  quantity: 'Quantity',
  dayNight: 'Day/Night',
};

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
  /** The split cutoff's time wheel — in the flow, so not a MenuId. */
  const [cutoffOpen, setCutoffOpen] = useState(false);
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
      setCutoffOpen(false);
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

  // One control open at a time across both kinds: a floating menu and the
  // in-flow time wheel would otherwise overlap, since the wheel sits directly
  // under the row the goal menus hang off.
  function toggleMenu(id: MenuId) {
    setCutoffOpen(false);
    setOpenMenu(prev => (prev === id ? null : id));
  }

  function toggleCutoff() {
    setOpenMenu(null);
    setCutoffOpen(prev => !prev);
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
    const nextOrder = Math.max(0, ...localDefs.map(d => d.order ?? 0)) + 1;
    setLocalDefs(prev => [...prev, {
      id,
      label: '',
      builtIn: false,
      reportStyle: 'status',
      order: nextOrder,
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

  /**
   * A goal belongs to at most one slot on one type — the two halves of a split
   * pair are two slots, so this counts both. A type deleted this session doesn't
   * hold its goals hostage: its tombstone keeps the ids, but the link is gone
   * with it.
   */
  function claimedElsewhere(goalId: string): boolean {
    return localDefs.some(d => (
      !d.removed && d.id !== selected?.id && (d.goalId === goalId || d.lateGoalId === goalId)
    ));
  }

  // Each slot offers every unclaimed goal except whatever the *other* slot on
  // this same type holds — one goal on both sides of the cutoff would be a pair
  // that isn't one.
  const earlyGoals = goalDefinitions.filter(g => !claimedElsewhere(g.id) && g.id !== selected?.lateGoalId);
  const lateGoals = goalDefinitions.filter(g => !claimedElsewhere(g.id) && g.id !== selected?.goalId);

  const linkedGoal = goalDefinitions.find(g => g.id === selected?.goalId);
  const lateGoal = goalDefinitions.find(g => g.id === selected?.lateGoalId);
  /**
   * Whether this type splits its completions across two goals by time of day —
   * the cutoff's presence, not the evening goal's, since Day/Night is chosen
   * before there's a second goal to pick. See EventTypeDefinition.goalSplitTime.
   */
  const isDayNight = !!selected?.goalSplitTime;
  const splitTime = selected?.goalSplitTime || DEFAULT_GOAL_SPLIT_TIME;

  const color = selected ? eventTypeColor(selected.id, localColors) : DEFAULT_GOAL_COLOR;
  // Checkbox types (task) and optional-end types (contact) have no duration to
  // set — eventTypeDefaultMinutes returns null for those.
  const minutes = selected ? eventTypeDefaultMinutes(selected.id, localMinutes) : null;
  const countChoice: CountChoice = isDayNight ? 'dayNight' : (selected?.goalMode ?? 'count');
  const reportStyle = selected?.reportStyle ?? 'status';

  /**
   * Day/Night is the one choice that isn't just a mode: it turns the link into a
   * pair by giving it a cutoff, and every other choice takes that cutoff — and
   * the evening goal hanging off it — back off again. Leaving either behind would
   * be a goal still claimed by a type that no longer counts it, which is a goal
   * that can't be deleted for a reason nothing on screen states.
   */
  function setCountChoice(next: CountChoice) {
    if (!selected) return;
    if (next === 'dayNight') {
      patchType(selected.id, { goalMode: 'count', goalSplitTime: splitTime });
      return;
    }
    setCutoffOpen(false);
    patchType(selected.id, { goalMode: next, lateGoalId: null, goalSplitTime: null });
  }

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
                then how it behaves. A group of its own so either goal menu, which
                can reach past the card's bottom edge, floats over the delete
                link below rather than painting behind it. */}
            <View style={(elevatedMenu === 'goal' || elevatedMenu === 'lateGoal') && styles.groupFloating}>
              <View style={[styles.card, { marginTop: 18 }]}>
                <View style={styles.section}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <View style={styles.nameRow}>
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
                    {/* Beside the name rather than at the foot of the sheet,
                        matching the person and event editors: deleting is about
                        the whole type, so it belongs against the thing that names
                        it and not below the last field, where it read as one more
                        part of the form. The Alert carries the destructive
                        weight, so the glyph doesn't need to. */}
                    <TouchableOpacity
                      onPress={handleDeletePress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete event type"
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
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
                    {/* Renamed while the type is a pair, because "Linked Goal"
                        and "Evening Goal" as a pair of labels says nothing about
                        which of the two this one is. */}
                    <Text style={styles.rowLabel}>{isDayNight ? 'Morning Goal' : 'Linked Goal'}</Text>
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
                      selectedIndex={selected.goalId ? 1 + earlyGoals.findIndex(g => g.id === selected.goalId) : 0}
                      maxRows={GOAL_MENU_ROWS}
                    >
                      <DropdownItem
                        label="None"
                        selected={!selected.goalId}
                        showSeparator={earlyGoals.length > 0}
                        onPress={() => {
                          // null, not undefined: an unlinked built-in has to
                          // out-argue its own seeded default — see
                          // EventTypeDefinition.goalId. The whole pair goes,
                          // since an evening goal with no morning one is a link
                          // getGoalContribution can't read. goalMode is left
                          // alone for the same reason a re-link keeps it.
                          patchType(selected.id, { goalId: null, lateGoalId: null, goalSplitTime: null });
                          setOpenMenu(null);
                        }}
                      />
                      {earlyGoals.map((g, i, arr) => (
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

                {/* The second half of the pair — only for a Day/Night type, which
                    is the point of putting that choice on the Goal Count Type
                    control: a type measured in hours or completions has no use
                    for this row and never shows it. This is what prayer's
                    morning/nightly goals used to be hardcoded for; any type can
                    carry the pair now, and prayer's is only a seeded default. */}
                {isDayNight && (
                  <View style={[styles.fieldRow, elevatedMenu === 'lateGoal' && styles.fieldRowOpen]}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => toggleMenu('lateGoal')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rowLabel}>Evening Goal</Text>
                      {lateGoal && (
                        <View style={[styles.goalIcon, { backgroundColor: isDark ? lateGoal.color : lateGoal.color + '20' }]}>
                          <GoalIcon icon={lateGoal.icon} iconFamily={lateGoal.iconFamily} size={15} color={iconTint(lateGoal.color)} />
                        </View>
                      )}
                      <Text style={styles.rowValue}>{lateGoal?.label ?? 'None'}</Text>
                      <Ionicons
                        name={openMenu === 'lateGoal' ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textLight}
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>

                    <DropdownMenu open={openMenu === 'lateGoal'}>
                      <MenuScrollView
                        open={openMenu === 'lateGoal'}
                        selectedIndex={selected.lateGoalId ? 1 + lateGoals.findIndex(g => g.id === selected.lateGoalId) : 0}
                        maxRows={GOAL_MENU_ROWS}
                      >
                        <DropdownItem
                          label="None"
                          selected={!selected.lateGoalId}
                          showSeparator={lateGoals.length > 0}
                          onPress={() => {
                            // The cutoff stays: it's what keeps this a Day/Night
                            // type, and clearing it here would silently reset the
                            // Goal Count Type control to Completion. Everything
                            // counts toward the morning goal meanwhile.
                            patchType(selected.id, { lateGoalId: null });
                            setOpenMenu(null);
                          }}
                        />
                        {lateGoals.map((g, i, arr) => (
                          <DropdownItem
                            key={g.id}
                            label={g.label}
                            selected={selected.lateGoalId === g.id}
                            showSeparator={i < arr.length - 1}
                            leading={<GoalIcon icon={g.icon} iconFamily={g.iconFamily} size={17} color={iconTint(g.color)} />}
                            labelStyle={{ marginLeft: 10 }}
                            onPress={() => {
                              patchType(selected.id, { lateGoalId: g.id });
                              setOpenMenu(null);
                            }}
                          />
                        ))}
                      </MenuScrollView>
                    </DropdownMenu>
                  </View>
                )}

                {/* Where the two halves divide. Shown for the whole of a
                    Day/Night type's life, evening goal picked or not — it is what
                    makes the type one, so hiding it until the pair was complete
                    would hide the only control that says so. */}
                {isDayNight && (
                  <>
                    <TouchableOpacity
                      // Hands its hairline to the hint below while the wheel is
                      // shut, so the two read as one block; keeps it while the
                      // wheel is out, where it's the only thing separating the
                      // row from its own panel.
                      style={[styles.row, !cutoffOpen && styles.rowLast]}
                      onPress={toggleCutoff}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rowLabel}>Switches At</Text>
                      <Text style={styles.rowValue}>{splitTime}</Text>
                      <Ionicons
                        name={cutoffOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textLight}
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>
                    <Collapsible open={cutoffOpen}>
                      <View style={styles.timeWheelPanel}>
                        <TimeWheelPicker
                          value={splitTime}
                          onChange={next => patchType(selected.id, { goalSplitTime: next })}
                        />
                      </View>
                    </Collapsible>
                    <Text style={styles.rowHint}>
                      {lateGoal
                        ? `Completions before ${splitTime} count toward ${linkedGoal?.label || 'the morning goal'}, and from ${splitTime} on toward ${lateGoal.label || 'the evening goal'}.`
                        : `Every completion counts toward ${linkedGoal?.label || 'the morning goal'} until an evening goal is picked.`}
                    </Text>
                  </>
                )}

                {/* Day/Night sits here rather than being a dropdown of its own,
                    so the rows above adapt to a choice made once instead of every
                    type carrying an Evening Goal row it will never use. */}
                {!!selected.goalId && (
                  <View style={styles.section}>
                    <Text style={styles.fieldLabel}>Goal Count Type</Text>
                    <View style={styles.segmentTrack}>
                      {COUNT_CHOICES.map(choice => (
                        <TouchableOpacity
                          key={choice}
                          style={[styles.segment, countChoice === choice && styles.segmentActive]}
                          onPress={() => setCountChoice(choice)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              styles.segmentTextTight,
                              countChoice === choice && styles.segmentTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {COUNT_CHOICE_LABEL[choice]}
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

        {/* The only thing under the card now that deleting has moved up beside
            the name — adding a type is the one action here that isn't editing
            what's already selected. */}
        <TouchableOpacity onPress={addType} style={styles.addBtn} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={Colors.white} />
          <Text style={styles.addBtnText}>Add an Event Type</Text>
        </TouchableOpacity>

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
    // The name field and the delete button, which shares its row rather than
    // sitting at the foot of the sheet.
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    // A recessed fill, same device the segmented control's track uses below, so
    // the field reads as something to tap into rather than a static label.
    nameField: {
      flex: 1,
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
    // Which goal each side of the cutoff feeds, spelled out — the two rows above
    // state the pair and the time, and neither says which way round they apply.
    // Carries the hairline for the block, as EditGoalsModal's hint does.
    rowHint: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      fontSize: 12,
      color: C.textLight,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    // The cutoff's time wheel, opening in the flow under its row. No rounded
    // bottom corners, unlike the Settings screen's: fields follow it inside the
    // same card, so it is never the card's last element.
    timeWheelPanel: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: C.card,
    },
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
    // Four segments in a track the other controls fill with three, so "Completion"
    // has ~71pt to sit in on the narrowest phone rather than ~85. A point off the
    // type fits it; `adjustsFontSizeToFit` would have been the obvious answer and
    // is iOS-only, so Android would have ellipsized instead of shrinking.
    segmentTextTight: { fontSize: 12 },
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
  });
}
