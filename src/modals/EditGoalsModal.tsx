import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert, View, Text, TextInput, TouchableOpacity, Pressable, ScrollView,
  StyleSheet,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { DEFAULT_GOAL_COLOR } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_GOALS, GoalDefinition, MAX_VISIBLE_GOALS } from '../constants/defaultGoals';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { GoalIcon } from '../components/GoalIcon';
import { SheetModal } from '../components/SheetModal';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { IconPickerSheet, DEFAULT_ICON } from '../components/IconPicker';
import { DropdownMenu, DropdownItem, MenuScrollView } from '../components/DropdownMenu';
import { useSettings } from '../hooks/useSettings';
import { eventTypeColor } from '../utils/eventUtils';

/** What a goal is called in the picker and the header while its name is blank. */
const UNTITLED = 'Untitled Goal';

// How many rows each menu shows before it scrolls. The half row is the point:
// a list cut mid-row says it continues, where a clean edge reads as the end.
const GOAL_MENU_ROWS = 6.5;
const TYPE_MENU_ROWS = 5.5;

/** Which floating menu is open. Both are on this one screen, so they share a slot. */
type MenuId = 'goal' | 'link';

/** Which of the two Home-screen grids a goal is tracked on. */
type GoalPeriod = 'weekly' | 'monthly' | 'both';

const PERIODS: GoalPeriod[] = ['weekly', 'monthly', 'both'];

const PERIOD_LABEL: Record<GoalPeriod, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  both: 'Both',
};

/**
 * The flag pair each choice writes. `visible` and `monthlyVisible` are still two
 * independent booleans on the definition — this is only the set of combinations
 * the UI can produce.
 */
const PERIOD_FLAGS: Record<GoalPeriod, { visible: boolean; monthlyVisible: boolean }> = {
  weekly: { visible: true, monthlyVisible: false },
  monthly: { visible: false, monthlyVisible: true },
  both: { visible: true, monthlyVisible: true },
};

/**
 * The stored pair read back as one choice. Both-false is no longer reachable —
 * a goal hidden from every grid is tracked nowhere and may as well not exist, so
 * the segmented control replaced the old Show-in-Grid switch rather than joining
 * it. Any definition still carrying both-false (a built-in default, or a goal
 * hidden before this control existed) reads as weekly, which is the grid it would
 * have been on: no migration pass, just a total function over the stored shape.
 */
function goalPeriod(def: GoalDefinition): GoalPeriod {
  if (def.visible && def.monthlyVisible) return 'both';
  if (def.monthlyVisible) return 'monthly';
  return 'weekly';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  onUpdateDefinitions: (defs: GoalDefinition[]) => Promise<void>;
  eventTypeDefs: EventTypeDefinition[];
  onUpdateEventTypeDefs: (defs: EventTypeDefinition[]) => Promise<void>;
  /** Closes this sheet (committing any pending edits, same as the X) and starts the Home screen's tap-to-order flow. */
  onReorderGoals: () => void;
}

/**
 * One goal's fields, on one screen, with a dropdown at the top choosing which
 * goal that is — replacing the list-then-drill-in pair this used to be (a list
 * of every goal here, and an `EditGoalSheet` stacked over it per goal).
 *
 * This is the only place a goal is defined, at either grain. There is no monthly
 * counterpart sheet: a goal's grain is the Goal Period control below, not a
 * separate screen of visibility toggles, so both Home-screen cards' EDIT links
 * land here.
 *
 * Because there is no sub-sheet to Cancel out of, every field edits **live**
 * into `localDefs` and is committed when the whole modal closes — the same
 * deal the visibility flags always had. Switching the dropdown mid-edit
 * therefore can't lose anything, which is the point: a Save button next to a
 * selector that silently discards is a trap.
 *
 * The two exceptions are Icon and Colour, which open bottom sheets of their own
 * and so come with a Cancel worth honouring — those hold a draft until Done.
 * They are `Modal`s over this `SheetModal`, two deep in all: the third level is
 * what used to freeze iOS, and is exactly what the old drill-in sheet cost.
 */
export function EditGoalsModal({
  visible, onClose, definitions, onUpdateDefinitions, eventTypeDefs, onUpdateEventTypeDefs, onReorderGoals,
}: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();

  const [localDefs, setLocalDefs] = useState<GoalDefinition[]>(definitions);
  // Mirrors localDefs, on the event-type side — only ever touched here to keep
  // a goal's link in step, since a link is stored on the type's own `goalId`.
  const [localEventTypeDefs, setLocalEventTypeDefs] = useState<EventTypeDefinition[]>(eventTypeDefs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [iconSheetOpen, setIconSheetOpen] = useState(false);
  const [colorSheetOpen, setColorSheetOpen] = useState(false);

  /**
   * Which group wins the paint order. Lags `openMenu` on the way down and only
   * ever moves to the other menu, never back to null — a menu animates out over
   * ~130ms with the open flag already false, and dropping the zIndex on close
   * would send it behind the cards below for that whole exit.
   */
  const [elevatedMenu, setElevatedMenu] = useState<MenuId | null>(null);
  useEffect(() => {
    if (openMenu) setElevatedMenu(openMenu);
  }, [openMenu]);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setLocalEventTypeDefs(eventTypeDefs);
      // Opens on the first goal rather than on nothing — the selector is the
      // only way in, so an empty one would read as a broken screen.
      setSelectedId(definitions.find(d => !d.removed)?.id ?? null);
      setOpenMenu(null);
      setIconSheetOpen(false);
      setColorSheetOpen(false);
    }
  }, [visible]);

  const activeDefs = localDefs.filter(d => !d.removed);
  // Falls back to the first goal so a delete, or a stale id, can never leave
  // the fields pointed at nothing while goals still exist.
  const selected = activeDefs.find(d => d.id === selectedId) ?? activeDefs[0];

  // Edits are committed when the sheet closes — including an iOS swipe-down dismiss,
  // which fires onRequestClose for a pageSheet. onClose fires first so the sheet's
  // slide-out animation starts immediately rather than waiting on the definitions
  // write (an AsyncStorage save plus one sequential sync-queue enqueue per goal).
  function handleClose() {
    onClose();
    setOpenMenu(null);
    // A blank name is allowed while typing — nothing nameless is allowed to
    // persist, since the picker would then have a row you can't read.
    onUpdateDefinitions(localDefs.map(d => (
      d.removed || d.label.trim() ? d : { ...d, label: UNTITLED }
    )));
    onUpdateEventTypeDefs(localEventTypeDefs);
  }

  // Same commit as the X, then hands off to the Home screen's tap-to-order flow
  // rather than just closing.
  function handleReorder() {
    handleClose();
    onReorderGoals();
  }

  // Each grid is capped on its own, so the two counts are tracked separately —
  // a full weekly grid says nothing about whether there's room on the monthly one.
  const weeklyFull = activeDefs.filter(d => d.visible).length >= MAX_VISIBLE_GOALS;
  const monthlyFull = activeDefs.filter(d => d.monthlyVisible).length >= MAX_VISIBLE_GOALS;

  const period = selected ? goalPeriod(selected) : 'weekly';

  /**
   * Whether this goal can move to `next` right now — false only when the move
   * would push a grid it isn't already on past its cap. Leaving a grid, or
   * staying on one it already occupies, never counts against the limit.
   */
  function periodBlocked(next: GoalPeriod): boolean {
    if (!selected) return true;
    const flags = PERIOD_FLAGS[next];
    if (flags.visible && !selected.visible && weeklyFull) return true;
    if (flags.monthlyVisible && !selected.monthlyVisible && monthlyFull) return true;
    return false;
  }

  /** Why one of the segments is dead — only worth saying when one is. */
  const showPeriodLimitHint = !!selected && PERIODS.some(periodBlocked);

  function setPeriod(next: GoalPeriod) {
    if (!selected || periodBlocked(next)) return;
    patchGoal(selected.id, PERIOD_FLAGS[next]);
  }

  function toggleMenu(id: MenuId) {
    setOpenMenu(prev => (prev === id ? null : id));
  }

  function label(def: GoalDefinition): string {
    return def.label.trim() || UNTITLED;
  }

  /** The icon's own tint — navy-on-near-black is unreadable, so dark mode lightens it. */
  function iconTint(color: string): string {
    return isDark ? lightenColor(color) : color;
  }

  /**
   * Whether a goal can be deleted right now — false while an event type still
   * links to it, in *either* slot. A type that splits by time of day holds two
   * goals, and the evening one is no less linked for being the second.
   */
  function goalInUse(id: string): boolean {
    return localEventTypeDefs.some(d => linksTo(d, id));
  }

  function linksTo(d: EventTypeDefinition, goalId: string): boolean {
    return d.goalId === goalId || d.lateGoalId === goalId;
  }

  function patchGoal(id: string, patch: Partial<GoalDefinition>) {
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  /**
   * A new goal is appended and selected straight away rather than drafted:
   * every other field on this screen edits live, and a draft would need the
   * Save/Cancel pair the selector was meant to replace. It starts nameless, so
   * the Name field's placeholder is the prompt.
   *
   * It lands on whichever grid has room, weekly first. There is no combination
   * that sits on neither grid, so a goal can only be added while at least one
   * of the two still has space.
   */
  const canAddGoal = !weeklyFull || !monthlyFull;

  function addGoal() {
    if (!canAddGoal) return;
    const id = `custom_${Date.now()}`;
    const nextOrder = Math.max(0, ...localDefs.map(d => d.order ?? 0)) + 1;
    const nextMonthlyOrder = Math.max(0, ...localDefs.map(d => d.monthlyOrder ?? 0)) + 1;
    setLocalDefs(prev => [...prev, {
      id,
      label: '',
      icon: DEFAULT_ICON.name,
      iconFamily: DEFAULT_ICON.family,
      color: DEFAULT_GOAL_COLOR,
      ...PERIOD_FLAGS[weeklyFull ? 'monthly' : 'weekly'],
      builtIn: false,
      order: nextOrder,
      monthlyOrder: nextMonthlyOrder,
    }]);
    setSelectedId(id);
    setOpenMenu(null);
  }

  /** Tombstones rather than removes the array entry — see GoalDefinition.removed. */
  function handleDeletePress() {
    if (!selected) return;
    if (goalInUse(selected.id)) {
      const linkedTypeLabel = localEventTypeDefs.find(t => linksTo(t, selected.id))?.label ?? 'an event type';
      Alert.alert(
        'Linked to an Event Type',
        `"${label(selected)}" is linked to ${linkedTypeLabel}. Set its Linked Event Type to None, then delete this goal.`,
      );
      return;
    }
    Alert.alert(
      `Delete "${label(selected)}"?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Lands on the next goal along, or the previous one at the end of
            // the list — the selector can't sit on the row that just went away.
            const index = activeDefs.findIndex(d => d.id === selected.id);
            const next = activeDefs[index + 1] ?? activeDefs[index - 1];
            patchGoal(selected.id, { removed: true });
            setSelectedId(next?.id ?? null);
          },
        },
      ],
      { cancelable: true },
    );
  }

  /**
   * Keeps a goal's link in step with the event-type side, where it's actually
   * stored. If the goal previously had a different type linked, that type is
   * freed; if a new type is picked, it's claimed.
   *
   * A type can hold this goal in either of two slots — the halves of a
   * time-of-day split — so freeing means clearing whichever slot held it.
   * Clearing the morning slot takes the evening one, and the cutoff, with it: an
   * evening goal with no morning goal is a link getGoalContribution reads as no
   * link at all, so leaving it would be silently dead configuration.
   *
   * Claiming always claims the morning slot, since that's the one a type needs
   * before it can split. A type that already holds this goal as its *evening*
   * half is therefore left exactly as it is — moving it to the morning slot
   * would quietly unlink whatever goal was there.
   */
  function applyEventTypeLink(goalId: string, newTypeId: string | undefined) {
    setLocalEventTypeDefs(prev => prev.map(d => {
      if (d.id === newTypeId) {
        if (d.lateGoalId === goalId) return d;
        return { ...d, goalId, goalMode: d.goalMode ?? 'count' };
      }
      // null, not undefined — an unlinked built-in has to out-argue its own
      // seeded default. See EventTypeDefinition.goalId.
      if (d.goalId === goalId) return { ...d, goalId: null, lateGoalId: null, goalSplitTime: null };
      // The cutoff stays, so the type is still Day/Night with its evening slot
      // empty — clearing it from here would reach across and change the type's
      // Goal Count Type, which is not what freeing one goal asked for.
      if (d.lateGoalId === goalId) return { ...d, lateGoalId: null };
      return d;
    }));
  }

  // Derived rather than held in state: the link lives on the event type, so
  // reading it back from localEventTypeDefs is the same as reading it live.
  const linkedType = selected
    ? localEventTypeDefs.find(t => linksTo(t, selected.id))
    : undefined;
  /** Whether this goal is the later half of that type's pair, not its only goal. */
  const linkedAsEvening = !!selected && !!linkedType && linkedType.lateGoalId === selected.id;
  /**
   * Types with no linked goal, plus whichever one currently links to this goal —
   * in either slot, so a goal that is some type's evening half still shows which
   * type that is instead of reading as unlinked.
   */
  const availableEventTypes = selected
    ? localEventTypeDefs.filter(t => !t.goalId || linksTo(t, selected.id))
    : [];

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Goals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {/* Dismisses whichever menu is open on a tap outside it. Ranked under
            the elevated group only, so the open menu and its own trigger stay
            live while everything else just closes it. */}
        {openMenu !== null && (
          <Pressable style={styles.pickerBackdrop} onPress={() => setOpenMenu(null)} />
        )}

        {/* Which goal every field below belongs to. Its own group, lifted over
            the cards that follow while its menu is out. */}
        <View style={elevatedMenu === 'goal' && styles.groupFloating}>
          <Text style={styles.sectionLabel}>GOAL</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedMenu === 'goal' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleMenu('goal')}
                activeOpacity={0.7}
              >
                {selected && (
                  <View style={[styles.rowIcon, { backgroundColor: isDark ? selected.color : selected.color + '20' }]}>
                    <GoalIcon icon={selected.icon} iconFamily={selected.iconFamily} size={16} color={iconTint(selected.color)} />
                  </View>
                )}
                <Text style={[styles.rowTitle, !selected && styles.rowTitleEmpty]} numberOfLines={1}>
                  {selected ? label(selected) : 'No goals'}
                </Text>
                <Ionicons
                  name={openMenu === 'goal' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              {/* Goals only — picking which one to edit. Adding one is the
                  link under the fields, not a row in here. */}
              <DropdownMenu open={openMenu === 'goal'}>
                <MenuScrollView
                  open={openMenu === 'goal'}
                  selectedIndex={activeDefs.findIndex(d => d.id === selected?.id)}
                  maxRows={GOAL_MENU_ROWS}
                >
                  {activeDefs.map((def, i, arr) => (
                    <DropdownItem
                      key={def.id}
                      label={label(def)}
                      selected={def.id === selected?.id}
                      showSeparator={i < arr.length - 1}
                      leading={<GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={17} color={iconTint(def.color)} />}
                      labelStyle={{ marginLeft: 10 }}
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
            {/* Every field in one card — what the goal is, then how it behaves.
                A group of its own so the link menu, which reaches past the
                card's bottom edge, floats over the delete link below. */}
            <View style={elevatedMenu === 'link' && styles.groupFloating}>
              <View style={[styles.card, { marginTop: 18 }]}>
                <View style={styles.section}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <View style={styles.nameRow}>
                    <View style={styles.nameField}>
                      <TextInput
                        style={styles.nameInput}
                        value={selected.label}
                        onChangeText={text => patchGoal(selected.id, { label: text })}
                        onFocus={() => setOpenMenu(null)}
                        placeholder="Goal name..."
                        placeholderTextColor={Colors.textLight}
                        returnKeyType="done"
                      />
                    </View>
                    {/* Beside the name rather than at the foot of the sheet,
                        matching the event-type sheet and the person editor:
                        deleting is about the whole goal, so it belongs against
                        the thing that names it. The Alert — which is also where a
                        goal still linked to an event type is refused — carries
                        the destructive weight, so the glyph doesn't need to. */}
                    <TouchableOpacity
                      onPress={handleDeletePress}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete goal"
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setOpenMenu(null); setIconSheetOpen(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Icon</Text>
                  <View style={styles.iconPreview}>
                    <GoalIcon icon={selected.icon} iconFamily={selected.iconFamily} size={18} color={selected.color} />
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setOpenMenu(null); setColorSheetOpen(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Color</Text>
                  <View style={[styles.rowDot, { marginRight: 0, backgroundColor: selected.color }]} />
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* Which grid(s) this goal is counted on — the same segmented
                    control the event-type sheet uses, and the reason there is no
                    separate monthly editor. The hint below belongs to this block,
                    so the hairline moves onto it rather than cutting between a
                    dead segment and its own reason. */}
                <View style={[styles.section, showPeriodLimitHint && styles.sectionFlush]}>
                  <Text style={styles.fieldLabel}>Goal Period</Text>
                  <View style={styles.segmentTrack}>
                    {PERIODS.map(p => {
                      const blocked = periodBlocked(p);
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.segment, period === p && styles.segmentActive]}
                          onPress={() => setPeriod(p)}
                          disabled={blocked}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              period === p && styles.segmentTextActive,
                              blocked && styles.segmentTextDisabled,
                            ]}
                          >
                            {PERIOD_LABEL[p]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {showPeriodLimitHint && (
                  <Text style={styles.rowHint}>
                    {`Each grid shows at most ${MAX_VISIBLE_GOALS} goals — move another goal off it first.`}
                  </Text>
                )}

                {/* The row's own positioned parent — DropdownMenu anchors to it. */}
                <View style={[styles.fieldRow, elevatedMenu === 'link' && styles.fieldRowOpen]}>
                  <TouchableOpacity
                    style={[styles.row, styles.rowLast]}
                    onPress={() => toggleMenu('link')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rowLabel}>Linked Event Type</Text>
                    {linkedType && (
                      <View style={[styles.rowDot, { backgroundColor: eventTypeColor(linkedType.id, settings.eventTypeColors) }]} />
                    )}
                    {/* Says which half it is when it's the second one — the type's
                        name alone would suggest this goal takes all of its
                        completions, when it only takes the ones after the
                        cutoff. */}
                    <Text style={styles.rowValue}>
                      {linkedType ? `${linkedType.label}${linkedAsEvening ? ' (evening)' : ''}` : 'None'}
                    </Text>
                    <Ionicons
                      name={openMenu === 'link' ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>

                  <DropdownMenu open={openMenu === 'link'}>
                    <MenuScrollView
                      open={openMenu === 'link'}
                      // None is row 0, so every type sits one further down.
                      selectedIndex={linkedType ? 1 + availableEventTypes.findIndex(t => t.id === linkedType.id) : 0}
                      maxRows={TYPE_MENU_ROWS}
                    >
                      <DropdownItem
                        label="None"
                        selected={linkedType === undefined}
                        showSeparator={availableEventTypes.length > 0}
                        onPress={() => { applyEventTypeLink(selected.id, undefined); setOpenMenu(null); }}
                      />
                      {availableEventTypes.map((t, i, arr) => (
                        <DropdownItem
                          key={t.id}
                          label={t.label}
                          selected={linkedType?.id === t.id}
                          showSeparator={i < arr.length - 1}
                          leading={<View style={[styles.rowDot, { marginRight: 0, backgroundColor: eventTypeColor(t.id, settings.eventTypeColors) }]} />}
                          labelStyle={{ marginLeft: 8 }}
                          onPress={() => { applyEventTypeLink(selected.id, t.id); setOpenMenu(null); }}
                        />
                      ))}
                    </MenuScrollView>
                  </DropdownMenu>
                </View>
              </View>
            </View>

          </>
        ) : (
          <Text style={styles.emptyHint}>Add a goal to start tracking one.</Text>
        )}

        {/* The only thing under the card now that deleting has moved up beside
            the name — adding a goal is the one action here that isn't editing
            what's already selected. */}
        <TouchableOpacity
          onPress={addGoal}
          disabled={!canAddGoal}
          activeOpacity={0.85}
          style={[styles.addBtn, !canAddGoal && styles.addBtnDisabled]}
        >
          <Ionicons name="add" size={18} color={canAddGoal ? Colors.white : Colors.textSecondary} />
          <Text style={[styles.addBtnText, !canAddGoal && styles.addBtnTextDisabled]}>
            {canAddGoal ? 'Add a Goal' : `Maximum of ${MAX_VISIBLE_GOALS} goals per grid`}
          </Text>
        </TouchableOpacity>

        {/* Hands off to the Home screen rather than reordering in place here —
            weekly and monthly are laid out as grids there, not this flat list,
            so that's where tapping a new position for each goal actually means
            something. */}
        <TouchableOpacity
          onPress={handleReorder}
          activeOpacity={0.85}
          style={styles.reorderBtn}
        >
          <Ionicons name="swap-vertical" size={18} color={Colors.textSecondary} />
          <Text style={styles.reorderBtnText}>Reorder Goals</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Both are Modals of their own, so they layer over this sheet rather
          than being clipped by it — and each keeps a draft until Done, unlike
          the live-editing rows behind them. */}
      <IconPickerSheet
        visible={iconSheetOpen && !!selected}
        icon={selected?.icon ?? DEFAULT_ICON.name}
        iconFamily={selected?.iconFamily ?? DEFAULT_ICON.family}
        color={selected?.color ?? DEFAULT_GOAL_COLOR}
        title={selected ? label(selected) : undefined}
        onCancel={() => setIconSheetOpen(false)}
        onDone={opt => {
          if (selected) patchGoal(selected.id, { icon: opt.name, iconFamily: opt.family });
          setIconSheetOpen(false);
        }}
      />

      <ColorPickerSheet
        visible={colorSheetOpen && !!selected}
        color={selected?.color ?? DEFAULT_GOAL_COLOR}
        title={selected ? label(selected) : undefined}
        defaultColor={selected?.builtIn ? DEFAULT_GOALS.find(g => g.id === selected.id)?.color : undefined}
        onCancel={() => setColorSheetOpen(false)}
        onDone={hex => {
          if (selected) patchGoal(selected.id, { color: hex });
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
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    closeBtn: {
      width: 60,
      alignItems: 'flex-start',
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      padding: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    // A card and its heading, as one stacking unit. Lifting the whole group is
    // what keeps a menu floating out of it above the cards that follow —
    // siblings with equal zIndex stack in document order, so a later card would
    // otherwise paint over it. Same shape as SettingsScreen's `section`.
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
    // A card row holding a control block (the Name field, the segmented
    // control) rather than a label-and-value line — same horizontal rhythm
    // as `row`.
    section: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    // A section that hands its hairline to the hint directly below it, so the
    // two read as one block instead of being cut apart by a rule.
    sectionFlush: {
      borderBottomWidth: 0,
      paddingBottom: 10,
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
    // the field reads as something to tap into rather than a static label — a
    // bare line of text at this size gave no hint.
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
    // The selector's own row: the goal's name is the row's subject, not a value
    // hanging off a label, so it takes the weight a rowLabel would.
    rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text },
    rowTitleEmpty: { fontWeight: '500', color: C.textLight },
    rowIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
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
    // An iOS-style segmented control, matching the event-type sheet's: a
    // recessed track (the app's own `background`, distinct from the card it
    // sits on) holding a pill that rises back to `card` level with its own
    // small shadow when selected, rather than a flat bordered strip with a
    // solid colour fill.
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
    // Dimmed rather than hidden: the option still exists, it just has no room
    // on the grid it would add this goal to. Overrides the active colour too,
    // though the two can't co-occur — the current choice is never blocked.
    segmentTextDisabled: { color: C.textLight },
    // Why a segment above it is dead — sits inside the card, under the control
    // it explains, rather than as a floating caption. It carries that block's
    // hairline, since the block gives it up to keep the two together.
    rowHint: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      fontSize: 12,
      color: C.textLight,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    emptyHint: {
      marginTop: 24,
      textAlign: 'center',
      fontSize: 14,
      color: C.textSecondary,
    },
    /**
     * A filled button rather than the ＋-and-label link this was. Adding a goal
     * is the one thing this sheet exists to do that isn't editing what's already
     * there, and a link read as another row of the form.
     *
     * `goalActionBg`, not `control`: this needs a white label, and `control` is
     * a pale blue in dark mode, which white sits on badly. That token is dark in
     * both themes for exactly this.
     *
     * Sized to its own content and centred, so it reads as a button rather than
     * as a bar across the sheet — the same shape as the Settings button on the
     * contact-import screen.
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
    // Still a button when the cap is reached, since it is still what states the
    // cap — just one that no longer offers to be pressed.
    addBtnDisabled: { backgroundColor: C.border },
    addBtnTextDisabled: { color: C.textSecondary },
    // Secondary to Add a Goal — no fill or border, so the two don't compete
    // for which is the primary action on this screen.
    reorderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    reorderBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.textSecondary,
    },
  });
}
