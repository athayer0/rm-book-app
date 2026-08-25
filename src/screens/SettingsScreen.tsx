import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Platform, useColorScheme, Switch, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeConfig, EventTypeLabels, DEFAULT_THEME_COLOR } from '../constants/colors';
import { THEME_COLOR_ROWS, type ThemeColorRowKey } from '../constants/themeColorRows';
import {
  THEME_COLOR_SCHEMES, STATUS_COLOR_SCHEMES,
  matchThemeColorScheme, schemeChipDots,
  type ThemeColorScheme,
} from '../constants/themeColorSchemes';
import {
  EVENT_COLOR_SCHEMES, GOAL_COLOR_SCHEMES, matchEventColorScheme, matchGoalColorScheme, SCHEME_PREVIEW_DOTS,
  type EventColorScheme, type GoalColorScheme,
} from '../constants/colorSchemes';
import { DEFAULT_GOALS } from '../constants/defaultGoals';
import { EventSizes, EVENT_SIZE_OPTIONS, resolveEventSize, eventSizePercent } from '../constants/eventSizes';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { DropdownMenu, DropdownItem, Collapsible, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';
import { QuickAddTypesModal } from '../modals/QuickAddTypesModal';
import { EventTypesModal } from '../modals/EventTypesModal';
import { ReorderEventTypesModal } from '../modals/ReorderEventTypesModal';
import { EventReminderTypesModal } from '../modals/EventReminderTypesModal';
import {
  DEFAULT_EVENT_TYPES, BUILTIN_GOAL_LINKS, BUILTIN_REPORT_STYLES, EventTypeDefinition, eventTypeDisplayLabel,
} from '../constants/eventTypeDefaults';
import { normalizeHex } from '../utils/colorUtils';
import { useSettings, DEFAULT_SETTINGS, type AppSettings } from '../hooks/useSettings';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { eventTypeColor, eventTypeDefaultMinutes } from '../utils/eventUtils';
import { useAuth } from '../lib/AuthContext';
import { MAPS_APP_OPTIONS } from '../utils/mapUtils';
import { CONTACT_METHODS, DEFAULT_CONTACT_METHOD, DEFAULT_METHOD_CHOICES } from '../constants/contactMethods';
import { GoalIcon } from '../components/GoalIcon';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { formatTime, parseTimeString, displayTime, hourOnlyLabel } from '../utils/dateUtils';
import { EVENT_REMINDER_MINUTE_OPTIONS, eventReminderLabel } from '../constants/eventReminders';
import { scheduleDailyReview } from '../lib/notifications';
import { useNotificationToggles } from '../hooks/useNotificationToggles';
import { useOnboardingReplay } from '../hooks/useOnboarding';

const START_HOUR_OPTIONS = [4, 5, 6, 7, 8, 9, 10];
const END_HOUR_OPTIONS = [21, 22, 23, 24];

// The only dropdown in this screen long enough to need capping — twelve rows
// unbounded runs off the bottom of shorter phones. Ends on half a row rather
// than a whole one, same as the status picker's list, so what's left says
// "more below" without needing a visible scrollbar to say it.
const EVENT_REMINDER_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 4.5;

// Whether a built-in type's editable fields still match what it ships with —
// used to grey out "Reset Event Types to Default" when there is nothing to
// restore. Mirrors the seeding useEventTypeDefinitions.mergeWithDefaults does
// for the goal link (both halves of a split pair, and its cutoff), goalMode and
// reportStyle. `?? undefined` on each id so an explicit unlink, which stores
// null, reads as different from the seeded default rather than equal to it.
function isStockBuiltInType(d: EventTypeDefinition): boolean {
  const seededLink = BUILTIN_GOAL_LINKS[d.id];
  const expectedReportStyle = BUILTIN_REPORT_STYLES[d.id] ?? 'none';
  return (
    d.label === EventTypeLabels[d.id] &&
    (d.goalId ?? undefined) === seededLink?.goalId &&
    (seededLink ? (d.goalMode ?? 'count') === seededLink.goalMode : true) &&
    (d.lateGoalId ?? undefined) === seededLink?.lateGoalId &&
    (d.goalSplitTime ?? undefined) === seededLink?.goalSplitTime &&
    (d.reportStyle ?? 'none') === expectedReportStyle
  );
}

// Every top-level dropdown/picker on this screen, so at most one can be open
// at a time — opening one closes whichever else was open, rather than each
// tracking its own independent boolean.
type DropdownKey =
  | 'hourStart' | 'hourEnd' | 'size' | 'language' | 'dailyReviewTime' | 'eventReminderLead'
  | 'masterColorScheme' | 'appColorScheme' | 'colors' | 'eventColorScheme' | 'goalColorScheme' | 'method';

/**
 * The dropdowns that open in the flow and push the rows below them down, rather
 * than floating over them.
 *
 * These are the ones an outside tap does *not* dismiss. A panel that moved the
 * page to make room for itself is something you work *inside* — pick a colour,
 * see what it did, pick again — not a menu hovering over your work. Closing one
 * on a stray tap would take back the space it just made and shift everything
 * under your finger. Both still close from the row that opened them.
 */
const IN_FLOW_DROPDOWNS: DropdownKey[] = ['colors', 'dailyReviewTime'];

export function SettingsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  // See HomeScreen for why this is the hook and not the <SafeAreaView> component.
  const insets = useSafeAreaInsets();

  const { settings, updateSettings } = useSettings();
  const {
    resetAll, resetBuiltInDefinitions,
    definitions: goalDefinitions, updateDefinitions: updateGoalDefinitions,
  } = useWeeklyGoals();
  const {
    definitions: eventTypeDefinitions,
    allDefinitions: allEventTypeDefinitions,
    updateDefinitions: updateEventTypeDefinitions,
    resetBuiltInDefinitions: resetBuiltInEventTypeDefinitions,
  } = useEventTypeDefinitions();
  // A deleted built-in no longer has a live definition, so it drops out of the
  // "N customized" counts below along with any type that was only ever hidden.
  const EVENT_TYPES = useMemo(
    () => Object.keys(EventColors).filter(id => eventTypeDefinitions.some(d => d.id === id)),
    [eventTypeDefinitions],
  );
  const { events, deleteAllEvents, deleteEventsOfType } = useCalendarEvents();
  const { signOut } = useAuth();
  const { toggleDailyReview, toggleEventReminders } = useNotificationToggles();
  const replayOnboarding = useOnboardingReplay();
  // Same resolution useColors() does internally — needed here too so the
  // theme-color list can show only the variant that's actually in effect.
  const systemScheme = useColorScheme();
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');
  // Primary always shows; secondary/tertiary show only their current-theme variant.
  const visibleColorRows = THEME_COLOR_ROWS.filter(row => !row.mode || row.mode === (isDark ? 'dark' : 'light'));
  // Which named scheme, if any, the current theme colours match exactly —
  // null once any row has been hand-edited away from a scheme's values.
  // Matched on the theme-colour fields only, same as onboarding's
  // themeSchemeId, even though picking a scheme also carries its status
  // colours along (see applyColorScheme below).
  const selectedSchemeId = matchThemeColorScheme(settings);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const eventReminderScrollEdges = useScrollEdges();
  // Which theme colour the picker sheet is editing, if any.
  const [colorSheet, setColorSheet] = useState<ThemeColorRowKey | null>(null);
  // Which of the event-type screens is open.
  const [eventSheet, setEventSheet] = useState<'types' | 'quickAdd' | 'reorder' | 'reminderTypes' | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  function toggleDropdown(key: DropdownKey) {
    setOpenDropdown(prev => (prev === key ? null : key));
  }

  /**
   * Which section currently wins the paint order. Lags `openDropdown` on the way
   * down and only ever moves to another open dropdown, never back to null: a
   * menu now animates out over ~130ms, and `openDropdown` is already null for
   * all of it. Dropping the zIndex the instant it closes would send the menu
   * behind the rows below for the whole exit. Leaving the last one elevated
   * afterwards costs nothing — there is no longer anything drawn to overlap.
   */
  const [elevatedDropdown, setElevatedDropdown] = useState<DropdownKey | null>(null);
  useEffect(() => {
    if (openDropdown) setElevatedDropdown(openDropdown);
  }, [openDropdown]);

  // An outside tap closes whichever dropdown floats over the rows beneath it;
  // the two that open in the flow are left alone. See IN_FLOW_DROPDOWNS.
  const dismissableDropdownOpen =
    openDropdown !== null && !IN_FLOW_DROPDOWNS.includes(openDropdown);

  // A row mid-edit can go out of view when the theme flips (the Theme section is
  // on this same screen) — close the picker rather than leave it editing a
  // variant that is no longer shown.
  useEffect(() => {
    setColorSheet(null);
  }, [isDark]);

  // The theme-colour picker hangs off a row inside "Customize Colors" — closing
  // that section, or opening a different one, dismisses it too rather than
  // leaving a sheet over a list that is no longer there.
  useEffect(() => {
    if (openDropdown !== 'colors') setColorSheet(null);
  }, [openDropdown]);

  // Leaving Settings for another tab closes every open dropdown and sheet, so
  // coming back — or landing on a different tab entirely — never shows one
  // already expanded from a prior visit.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setOpenDropdown(null);
        setColorSheet(null);
        setEventSheet(null);
      };
    }, []),
  );

  const selectedEventSize = resolveEventSize(settings.eventSize);
  // Settings persist, so a stored method may name a choice this build no longer has.
  const selectedMethod = CONTACT_METHODS[settings.defaultContactMethod]
    ? settings.defaultContactMethod
    : DEFAULT_CONTACT_METHOD;

  async function handleSignOut() {
    const { cleared, pending } = await signOut();
    // Unsynced work is kept rather than discarded. It will push on the next
    // sign-in — but until then the next account to use this device sees it.
    if (!cleared) {
      Alert.alert(
        t('settingsScreen.signedOutLocalDataKeptTitle'),
        t('settingsScreen.signedOutLocalDataKeptBody', { count: pending }),
      );
    }
  }

  async function handleSelectDailyReviewTime(timeStr: string) {
    const { hour, minute } = parseTimeString(timeStr);
    updateSettings({ dailyReviewHour: hour, dailyReviewMinute: minute });
    if (settings.dailyReviewEnabled) await scheduleDailyReview(hour, minute, t);
  }

  // Sets every THEME_COLOR_ROWS field at once — both light and dark variants,
  // regardless of which one is currently on screen — plus the same-id status
  // scheme, mirroring onboarding's selectThemeScheme. A scheme is one
  // identity across primary/secondary/tertiary/status, not a partial pick.
  function applyColorScheme(scheme: ThemeColorScheme) {
    const statusScheme = STATUS_COLOR_SCHEMES.find(s => s.id === scheme.id);
    updateSettings({
      themeColor: scheme.themeColor,
      secondaryColorLight: scheme.secondaryColorLight,
      secondaryColorDark: scheme.secondaryColorDark,
      tertiaryColorLight: scheme.tertiaryColorLight,
      tertiaryColorDark: scheme.tertiaryColorDark,
      ...(statusScheme ? {
        statusCompletedColorLight: statusScheme.statusCompletedColorLight,
        statusCompletedColorDark: statusScheme.statusCompletedColorDark,
        statusFailedColorLight: statusScheme.statusFailedColorLight,
        statusFailedColorDark: statusScheme.statusFailedColorDark,
        statusPendingColorLight: statusScheme.statusPendingColorLight,
        statusPendingColorDark: statusScheme.statusPendingColorDark,
      } : {}),
    });
    setOpenDropdown(null);
  }

  // Applies one scheme's identity to theme + status colors, event-type
  // colors, and goal colors all at once — the Appearance card's master
  // Color Scheme row. The three underlying schemes share the same five ids
  // (see the top-of-file note on THEME_COLOR_SCHEMES), and updateSettings'
  // write() resolves against a ref rather than a stale closure, so calling
  // applyColorScheme then applyEventColorScheme in the same tick merges
  // rather than one clobbering the other.
  function applyAllColorSchemes(scheme: ThemeColorScheme) {
    applyColorScheme(scheme);
    const eventScheme = EVENT_COLOR_SCHEMES.find(s => s.id === scheme.id);
    if (eventScheme) applyEventColorScheme(eventScheme);
    const goalScheme = GOAL_COLOR_SCHEMES.find(s => s.id === scheme.id);
    if (goalScheme) applyGoalColorScheme(goalScheme);
  }

  function handleResetWeek() {
    Alert.alert(
      t('settingsScreen.resetWeekTitle'),
      t('settingsScreen.resetWeekBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: () => {
            resetAll();
            resetBuiltInDefinitions();
          },
        },
      ],
    );
  }

  // Per-type editing lives in EventTypesModal's edit sheet, one type at a
  // time. The bulk resets stay here instead: a reset is a thing you do to the
  // whole set at once, not a field on any single type's edit sheet.
  const effectiveColor = (type: string) => eventTypeColor(type, settings.eventTypeColors);
  const effectiveMinutes = (type: string) =>
    eventTypeDefaultMinutes(type, settings.eventTypeDefaultMinutes);
  const stockMinutes = (type: string) => EventTypeConfig[type]?.defaultMinutes ?? 30;

  // A type is "customized" by what it resolves to, not by whether it has an
  // override: one set back to the stock value by hand has nothing to reset.
  const customizedColorTypes = EVENT_TYPES.filter(t => effectiveColor(t) !== EventColors[t]);

  // Which named event-color scheme, if any, every built-in id's effective
  // color currently matches — over DEFAULT_EVENT_TYPES rather than the
  // (possibly narrower) EVENT_TYPES list, same as onboarding's
  // resolvedEventColors, so a deleted built-in doesn't block the match.
  const resolvedEventColors = Object.fromEntries(
    DEFAULT_EVENT_TYPES.map(d => [d.id, effectiveColor(d.id)]),
  );
  const selectedEventSchemeId = matchEventColorScheme(resolvedEventColors);

  // Overwrites only the built-in ids a scheme covers — a custom event type
  // has no entry in scheme.colors and keeps whatever color it was given,
  // same contract EVENT_COLOR_SCHEMES documents for the onboarding picker.
  function applyEventColorScheme(scheme: EventColorScheme) {
    updateSettings({ eventTypeColors: { ...settings.eventTypeColors, ...scheme.colors } });
    setOpenDropdown(null);
  }

  // Same idea, over goal ids' own `color` field rather than a settings map —
  // goalDefinitions is the live, already-merged list, so a built-in def is
  // rewritten in place with the scheme's color and everything else about it
  // (target, icon, goal link) untouched; a custom goal has no entry in
  // scheme.colors and passes through unchanged.
  const resolvedGoalColors = Object.fromEntries(
    DEFAULT_GOALS.map(d => [d.id, goalDefinitions.find(x => x.id === d.id)?.color ?? d.color]),
  );
  const selectedGoalSchemeId = matchGoalColorScheme(resolvedGoalColors);

  function applyGoalColorScheme(scheme: GoalColorScheme) {
    updateGoalDefinitions(goalDefinitions.map(d => (
      scheme.colors[d.id] ? { ...d, color: scheme.colors[d.id] } : d
    )));
    setOpenDropdown(null);
  }

  // The Appearance card's master picker only shows a scheme selected once
  // theme, event, and goal colors all independently resolve to that same
  // id — a partial match (someone hand-tuned one category) reads as Custom,
  // same as each individual picker already does.
  const masterSchemeId =
    selectedSchemeId && selectedSchemeId === selectedEventSchemeId && selectedSchemeId === selectedGoalSchemeId
      ? selectedSchemeId
      : null;

  // Types with no duration to offer at all have nothing to be customized —
  // effectiveMinutes is already null for them.
  const customizedDurationTypes = EVENT_TYPES.filter(t => {
    const mins = effectiveMinutes(t);
    return mins !== null && mins !== stockMinutes(t);
  });

  // Order matters here (it's bubble order), so this is a full-array compare
  // rather than a per-type diff like the two above.
  const quickAddIsDefault = JSON.stringify(settings.quickAddTypes) === JSON.stringify(DEFAULT_SETTINGS.quickAddTypes);

  // "Reset Event Types to Default" covers the type list itself — restoring any
  // deleted built-in and dropping every custom type — not colors or durations,
  // which are separate settings with their own resets above.
  const customEventTypes = eventTypeDefinitions.filter(d => !d.builtIn);
  const removedBuiltInTypes = DEFAULT_EVENT_TYPES.filter(def => !eventTypeDefinitions.some(d => d.id === def.id));
  const modifiedBuiltInTypes = eventTypeDefinitions.filter(d => d.builtIn && !isStockBuiltInType(d));
  const eventTypesAreDefault =
    customEventTypes.length === 0 && removedBuiltInTypes.length === 0 && modifiedBuiltInTypes.length === 0;

  // Summarizes the reminder-types row's value without opening the sheet —
  // "All types" is the common case (nothing excluded yet), otherwise how many
  // of the current type list still send reminders.
  const reminderTypesLabel = settings.eventReminderExcludedTypeIds.length === 0
    ? t('settingsScreen.eventReminders.allTypes')
    : t('settingsScreen.eventReminders.typesOfTotal', {
      count: eventTypeDefinitions.length - settings.eventReminderExcludedTypeIds.length,
      total: eventTypeDefinitions.length,
    });

  // Both resets are all-or-nothing and confirmed by an alert rather than a panel
  // of checkboxes. The alert names the count, since the row itself no longer
  // shows which types are affected — and the same alert pattern already guards
  // the destructive rows further down this screen.
  function confirmResetEventColors() {
    const n = customizedColorTypes.length;
    Alert.alert(
      t('settingsScreen.resetEventColorsTitle'),
      t('settingsScreen.resetEventColorsBody', { count: n }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: () => {
            // Deleting the override is the reset — eventTypeColor then falls
            // through to EventColors. Writing the stock colour in would leave it
            // looking custom.
            const next = { ...settings.eventTypeColors };
            customizedColorTypes.forEach(t => { delete next[t]; });
            updateSettings({ eventTypeColors: next });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function confirmResetEventDurations() {
    const n = customizedDurationTypes.length;
    Alert.alert(
      t('settingsScreen.resetDurationsTitle'),
      t('settingsScreen.resetDurationsBody', { count: n }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: () => {
            const next = { ...settings.eventTypeDefaultMinutes };
            customizedDurationTypes.forEach(t => { delete next[t]; });
            updateSettings({ eventTypeDefaultMinutes: next });
          },
        },
      ],
      { cancelable: true },
    );
  }

  // Bulk reset of the type list itself — restores every built-in (including
  // any that were deleted) and drops every custom type. Mirrors
  // EventTypesModal's single-delete flow: a type still in use gets the
  // "in use, delete its events too?" alert instead of the plain confirm.
  function confirmResetEventTypes() {
    const inUseCustoms = customEventTypes.filter(t => events.some(e => e.type === t.id));

    if (inUseCustoms.length > 0) {
      const eventCount = inUseCustoms.reduce((sum, ty) => sum + events.filter(e => e.type === ty.id).length, 0);
      const using = inUseCustoms.length === 1
        ? `"${eventTypeDisplayLabel(inUseCustoms[0], t)}"`
        : t('settingsScreen.customEventTypesCount', { count: inUseCustoms.length });
      Alert.alert(
        t('settingsScreen.resetEventTypesTitle'),
        t('settingsScreen.resetEventTypesInUseBody', { count: eventCount, using }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('settingsScreen.deleteAllAndReset'), style: 'destructive', onPress: () => performResetEventTypes(customEventTypes) },
        ],
        { cancelable: true },
      );
      return;
    }

    Alert.alert(
      t('settingsScreen.eventTypes.resetEventTypes'),
      customEventTypes.length > 0
        ? t('settingsScreen.resetEventTypesBodyWithCustoms', { count: customEventTypes.length })
        : t('settingsScreen.resetEventTypesBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.reset'), style: 'destructive', onPress: () => performResetEventTypes(customEventTypes) },
      ],
      { cancelable: true },
    );
  }

  async function performResetEventTypes(customTypes: EventTypeDefinition[]) {
    for (const t of customTypes) {
      await deleteEventsOfType(t.id);
    }
    await updateEventTypeDefinitions(DEFAULT_EVENT_TYPES.map(d => ({ ...d })));
  }

  function confirmResetQuickAdd() {
    Alert.alert(
      t('settingsScreen.resetQuickAddTitle'),
      t('settingsScreen.resetQuickAddBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: () => updateSettings({ quickAddTypes: DEFAULT_SETTINGS.quickAddTypes }),
        },
      ],
      { cancelable: true },
    );
  }

  const colorSheetRow = THEME_COLOR_ROWS.find(row => row.key === colorSheet);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settingsScreen.title')}</Text>
      </View>

      {/* automaticallyAdjustKeyboardInsets, as on every other scroll in the app,
          so focused content can clear the keyboard. */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {dismissableDropdownOpen && (
          <Pressable style={styles.pickerBackdrop} onPress={() => setOpenDropdown(null)} />
        )}

        {/* Appearance — every visual/display setting in one card: Language,
            Event Size, and Mode (light/dark/system) right below it, then the
            master Color Scheme (applies one of the five named looks to
            theme + status + event-type + goal colors together — see
            applyAllColorSchemes). App Color Scheme is the same five presets
            but scoped to just the app colors below it (applyColorScheme,
            no event/goal write), for when only those should change. Then
            App Colors' per-swatch editor (was "Customize Colors"), and quick
            links down to Event Types' and Goals' own Color Scheme rows for
            overriding just one category. Event Bubble has its own card
            below. */}
        <View
          style={[
            styles.section,
            (elevatedDropdown === 'masterColorScheme' || elevatedDropdown === 'appColorScheme'
              || elevatedDropdown === 'eventColorScheme' || elevatedDropdown === 'goalColorScheme'
              || elevatedDropdown === 'size' || elevatedDropdown === 'language') && styles.sectionFloating,
          ]}
        >
          <Text style={styles.sectionTitle}>{t('settingsScreen.appearance.sectionTitle')}</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'language' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('language')}
              >
                <Text style={styles.rowLabel}>{t('settings.language.label')}</Text>
                <Text style={styles.rowValue}>
                  {settings.language === 'es' ? t('settings.language.spanish') : t('settings.language.english')}
                </Text>
                <Ionicons
                  name={openDropdown === 'language' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'language'}>
                {(['en', 'es'] as const).map((language, i, arr) => (
                  <DropdownItem
                    key={language}
                    label={language === 'es' ? t('settings.language.spanish') : t('settings.language.english')}
                    selected={settings.language === language}
                    showSeparator={i < arr.length - 1}
                    onPress={() => { updateSettings({ language }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'size' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('size')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.eventSize.size')}</Text>
                <Text style={styles.rowValue}>
                  {t(`eventSizes.${selectedEventSize}`, { defaultValue: EventSizes[selectedEventSize].label })} ({eventSizePercent(selectedEventSize)}%)
                </Text>
                <Ionicons
                  name={openDropdown === 'size' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'size'}>
                {EVENT_SIZE_OPTIONS.map((size, i, arr) => (
                  <DropdownItem
                    key={size}
                    label={`${t(`eventSizes.${size}`, { defaultValue: EventSizes[size].label })} (${eventSizePercent(size)}%)`}
                    selected={selectedEventSize === size}
                    showSeparator={i < arr.length - 1}
                    onPress={() => { updateSettings({ eventSize: size }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.theme.label')}</Text>
              <View style={styles.prefPills}>
                {(['light', 'dark', 'system'] as const).map(theme => (
                  <TouchableOpacity
                    key={theme}
                    style={[styles.pillSmall, settings.theme === theme && styles.pillActive]}
                    onPress={() => updateSettings({ theme })}
                  >
                    <Text style={[styles.pillTextSmall, settings.theme === theme && styles.pillTextActive]}>
                      {t(`settings.theme.${theme}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'masterColorScheme' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('masterColorScheme')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.appearance.colorScheme')}</Text>
                <Text style={styles.rowValue}>
                  {masterSchemeId
                    ? t(`colorSchemes.${masterSchemeId}`, { defaultValue: THEME_COLOR_SCHEMES.find(s => s.id === masterSchemeId)?.label })
                    : t('settingsScreen.appearance.customScheme')}
                </Text>
                <Ionicons
                  name={openDropdown === 'masterColorScheme' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'masterColorScheme'}>
                {THEME_COLOR_SCHEMES.map((scheme, i, arr) => (
                  <DropdownItem
                    key={scheme.id}
                    label={t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}
                    selected={masterSchemeId === scheme.id}
                    showSeparator={i < arr.length - 1}
                    leading={
                      <View style={styles.schemeDotsRow}>
                        {schemeChipDots(scheme.id, isDark).map((color, di) => (
                          <View key={di} style={[styles.schemeDot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    }
                    onPress={() => applyAllColorSchemes(scheme)}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'appColorScheme' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('appColorScheme')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.appearance.appColorScheme')}</Text>
                <Text style={styles.rowValue}>
                  {selectedSchemeId
                    ? t(`colorSchemes.${selectedSchemeId}`, { defaultValue: THEME_COLOR_SCHEMES.find(s => s.id === selectedSchemeId)?.label })
                    : t('settingsScreen.appearance.customScheme')}
                </Text>
                <Ionicons
                  name={openDropdown === 'appColorScheme' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'appColorScheme'}>
                {THEME_COLOR_SCHEMES.map((scheme, i, arr) => (
                  <DropdownItem
                    key={scheme.id}
                    label={t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}
                    selected={selectedSchemeId === scheme.id}
                    showSeparator={i < arr.length - 1}
                    leading={
                      <View style={styles.schemeDotsRow}>
                        {schemeChipDots(scheme.id, isDark).map((color, di) => (
                          <View key={di} style={[styles.schemeDot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    }
                    onPress={() => applyColorScheme(scheme)}
                  />
                ))}
              </DropdownMenu>
            </View>

            <TouchableOpacity
              style={styles.row}
              onPress={() => toggleDropdown('colors')}
            >
              <Text style={styles.rowLabel}>{t('settingsScreen.appearance.appColors')}</Text>
              <View style={styles.dotPreviewRow}>
                {visibleColorRows.map(row => (
                  <View
                    key={row.key}
                    style={[styles.dotPreview, { backgroundColor: normalizeHex(settings[row.settingKey]) ?? row.defaultValue }]}
                  />
                ))}
              </View>
              <Ionicons
                name={openDropdown === 'colors' ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
            <Collapsible open={openDropdown === 'colors'}>
              <View style={styles.dropdownList}>
                {visibleColorRows.map((row, i, arr) => {
                  // The dot is the value; the hex it happens to have said
                  // nothing the colour itself doesn't.
                  const value = normalizeHex(settings[row.settingKey]) ?? row.defaultValue;
                  return (
                    <TouchableOpacity
                      key={row.key}
                      style={styles.dropdownItem}
                      onPress={() => setColorSheet(row.key)}
                    >
                      <View style={[styles.colorDot, { backgroundColor: value }]} />
                      <Text style={styles.dropdownItemText}>{t(`themeColorRows.${row.key}`, { defaultValue: row.label })}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Collapsible>

            <View style={[styles.fieldRow, elevatedDropdown === 'eventColorScheme' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('eventColorScheme')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.appearance.eventColors')}</Text>
                <Text style={styles.rowValue}>
                  {selectedEventSchemeId
                    ? t(`colorSchemes.${selectedEventSchemeId}`, { defaultValue: EVENT_COLOR_SCHEMES.find(s => s.id === selectedEventSchemeId)?.label })
                    : t('settingsScreen.eventTypes.customScheme')}
                </Text>
                <Ionicons
                  name={openDropdown === 'eventColorScheme' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'eventColorScheme'}>
                {EVENT_COLOR_SCHEMES.map((scheme, i, arr) => (
                  <DropdownItem
                    key={scheme.id}
                    label={t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}
                    selected={selectedEventSchemeId === scheme.id}
                    showSeparator={i < arr.length - 1}
                    leading={
                      <View style={styles.schemeDotsRow}>
                        {(SCHEME_PREVIEW_DOTS[scheme.id] ?? []).map((color, di) => (
                          <View key={di} style={[styles.schemeDot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    }
                    onPress={() => applyEventColorScheme(scheme)}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'goalColorScheme' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleDropdown('goalColorScheme')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.appearance.goalColors')}</Text>
                <Text style={styles.rowValue}>
                  {selectedGoalSchemeId
                    ? t(`colorSchemes.${selectedGoalSchemeId}`, { defaultValue: GOAL_COLOR_SCHEMES.find(s => s.id === selectedGoalSchemeId)?.label })
                    : t('settingsScreen.goals.customScheme')}
                </Text>
                <Ionicons
                  name={openDropdown === 'goalColorScheme' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'goalColorScheme'}>
                {GOAL_COLOR_SCHEMES.map((scheme, i, arr) => (
                  <DropdownItem
                    key={scheme.id}
                    label={t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}
                    selected={selectedGoalSchemeId === scheme.id}
                    showSeparator={i < arr.length - 1}
                    leading={
                      <View style={styles.schemeDotsRow}>
                        {(SCHEME_PREVIEW_DOTS[scheme.id] ?? []).map((color, di) => (
                          <View key={di} style={[styles.schemeDot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    }
                    onPress={() => applyGoalColorScheme(scheme)}
                  />
                ))}
              </DropdownMenu>
            </View>
          </View>
        </View>

        {/* Event Types — name/status/goal-link editing plus color and duration
            both live inside the "Customize" sheet now, per type. Colors and
            durations used to have their own screens listing every type flat;
            those are gone, but their bulk "Reset to Default" actions stay
            here alongside a reset for the type list itself. Color Scheme
            (applies one of the five named palettes to every built-in type's
            color in one shot — see applyEventColorScheme) lives on the
            Appearance card now, as the Event Colors row, rather than here. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settingsScreen.eventTypes.sectionTitle')}</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => setEventSheet('types')}>
              <Text style={styles.rowLabel}>{t('settingsScreen.customize')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={() => setEventSheet('reorder')}>
              <Text style={styles.rowLabel}>{t('settingsScreen.reorder')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              disabled={customizedColorTypes.length === 0}
              onPress={confirmResetEventColors}
            >
              {/* The greyed label and icon are the whole disabled state now —
                  nothing to reset reads clearly enough without saying so. */}
              <Text style={[styles.rowLabel, { color: customizedColorTypes.length ? Colors.text : Colors.textLight }]}>
                {t('settingsScreen.eventTypes.resetColors')}
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={customizedColorTypes.length ? Colors.textLight : Colors.border}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              disabled={customizedDurationTypes.length === 0}
              onPress={confirmResetEventDurations}
            >
              <Text style={[styles.rowLabel, { color: customizedDurationTypes.length ? Colors.text : Colors.textLight }]}>
                {t('settingsScreen.eventTypes.resetDurations')}
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={customizedDurationTypes.length ? Colors.textLight : Colors.border}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              disabled={eventTypesAreDefault}
              onPress={confirmResetEventTypes}
            >
              <Text style={[styles.rowLabel, { color: eventTypesAreDefault ? Colors.textLight : Colors.text }]}>
                {t('settingsScreen.eventTypes.resetEventTypes')}
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={eventTypesAreDefault ? Colors.border : Colors.textLight}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Event Bubble + — the calendar's quick-add button. Customize (which
            event types show as bubbles) and a reset back to the shipped set,
            mirroring Event Types' own Customize row. Its own card now rather
            than a tail end of Appearance. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settingsScreen.eventBubble.sectionTitle')}</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => setEventSheet('quickAdd')}>
              <Text style={styles.rowLabel}>{t('settingsScreen.customize')}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              disabled={quickAddIsDefault}
              onPress={confirmResetQuickAdd}
            >
              <Text style={[styles.rowLabel, { color: quickAddIsDefault ? Colors.textLight : Colors.text }]}>
                {t('settingsScreen.resetToDefault')}
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={quickAddIsDefault ? Colors.border : Colors.textLight}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendar & Schedule — Week Start, Time Format, Schedule Hours,
            Daily Review, and Event Reminders all in one card, in the order
            you'd hit them setting up a week. Time Format sits right below
            Week Start since Schedule Hours and Daily Review both display in
            whichever format it picks. Daily Review's time wheel still opens
            in the flow (Collapsible, key dailyReviewTime) rather than
            floating, so it needs no lift of its own. */}
        <View
          style={[
            styles.section,
            (elevatedDropdown === 'hourStart' || elevatedDropdown === 'hourEnd'
              || elevatedDropdown === 'eventReminderLead') && styles.sectionFloating,
          ]}
        >
          <Text style={styles.sectionTitle}>{t('settingsScreen.calendarSchedule.sectionTitle')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settingsScreen.weekStart.label')}</Text>
              <View style={styles.prefPills}>
                {(['sunday', 'monday'] as const).map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.pillSmall, settings.weekStart === day && styles.pillActive]}
                    onPress={() => updateSettings({ weekStart: day })}
                  >
                    <Text style={[styles.pillTextSmall, settings.weekStart === day && styles.pillTextActive]}>
                      {t(`calendar.weekdayFull.${day}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.timeFormat.label')}</Text>
              <View style={styles.prefPills}>
                {(['12h', '24h'] as const).map(timeFormat => (
                  <TouchableOpacity
                    key={timeFormat}
                    style={[styles.pillSmall, settings.timeFormat === timeFormat && styles.pillActive]}
                    onPress={() => updateSettings({ timeFormat })}
                  >
                    <Text style={[styles.pillTextSmall, settings.timeFormat === timeFormat && styles.pillTextActive]}>
                      {timeFormat === '24h' ? t('settings.timeFormat.military') : t('settings.timeFormat.standard')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'hourStart' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('hourStart')}
              >
                <Text style={styles.rowLabel}>{t('addEditEvent.startTime')}</Text>
                <Text style={styles.rowValue}>{hourOnlyLabel(settings.gridStartHour, settings.language, settings.timeFormat)}</Text>
                <Ionicons
                  name={openDropdown === 'hourStart' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'hourStart'}>
                {START_HOUR_OPTIONS.map((h, i) => (
                  <DropdownItem
                    key={h}
                    label={hourOnlyLabel(h, settings.language, settings.timeFormat)}
                    selected={settings.gridStartHour === h}
                    showSeparator={i < START_HOUR_OPTIONS.length - 1}
                    onPress={() => { updateSettings({ gridStartHour: h }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'hourEnd' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('hourEnd')}
              >
                <Text style={styles.rowLabel}>{t('addEditEvent.endTime')}</Text>
                <Text style={styles.rowValue}>{hourOnlyLabel(settings.gridEndHour, settings.language, settings.timeFormat)}</Text>
                <Ionicons
                  name={openDropdown === 'hourEnd' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'hourEnd'}>
                {END_HOUR_OPTIONS.map((h, i) => (
                  <DropdownItem
                    key={h}
                    label={hourOnlyLabel(h, settings.language, settings.timeFormat)}
                    selected={settings.gridEndHour === h}
                    showSeparator={i < END_HOUR_OPTIONS.length - 1}
                    onPress={() => { updateSettings({ gridEndHour: h }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settingsScreen.dailyReview.label')}</Text>
              <Switch
                value={settings.dailyReviewEnabled}
                onValueChange={toggleDailyReview}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {settings.dailyReviewEnabled && (
              <>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => toggleDropdown('dailyReviewTime')}
                >
                  <Text style={styles.rowLabel}>{t('settingsScreen.time')}</Text>
                  <Text style={styles.rowValue}>
                    {displayTime(formatTime(settings.dailyReviewHour, settings.dailyReviewMinute), settings.language, settings.timeFormat)}
                  </Text>
                  <Ionicons
                    name={openDropdown === 'dailyReviewTime' ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textLight}
                    style={{ marginLeft: 6 }}
                  />
                </TouchableOpacity>
                <Collapsible open={openDropdown === 'dailyReviewTime'}>
                  <View style={styles.timeWheelPanel}>
                    <TimeWheelPicker
                      value={formatTime(settings.dailyReviewHour, settings.dailyReviewMinute)}
                      onChange={handleSelectDailyReviewTime}
                    />
                  </View>
                </Collapsible>
              </>
            )}

            <View style={[styles.row, !settings.eventReminderEnabled && styles.rowLast]}>
              <Text style={styles.rowLabel}>{t('settingsScreen.eventReminders.label')}</Text>
              <Switch
                value={settings.eventReminderEnabled}
                onValueChange={toggleEventReminders}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {settings.eventReminderEnabled && (
              <>
                <View style={[styles.fieldRow, elevatedDropdown === 'eventReminderLead' && styles.fieldRowOpen]}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => toggleDropdown('eventReminderLead')}
                  >
                    <Text style={styles.rowLabel}>{t('settingsScreen.eventReminders.timeBefore')}</Text>
                    <Text style={styles.rowValue}>{eventReminderLabel(settings.eventReminderMinutes, t)}</Text>
                    <Ionicons
                      name={openDropdown === 'eventReminderLead' ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>
                  <DropdownMenu open={openDropdown === 'eventReminderLead'}>
                    <ScrollView
                      style={{ maxHeight: EVENT_REMINDER_LIST_MAX_HEIGHT }}
                      nestedScrollEnabled
                      bounces={false}
                      overScrollMode="never"
                      {...eventReminderScrollEdges.scrollViewProps}
                    >
                      {EVENT_REMINDER_MINUTE_OPTIONS.map((minutes, i, arr) => (
                        <DropdownItem
                          key={minutes}
                          label={eventReminderLabel(minutes, t)}
                          selected={settings.eventReminderMinutes === minutes}
                          showSeparator={i < arr.length - 1}
                          onPress={() => { updateSettings({ eventReminderMinutes: minutes }); setOpenDropdown(null); }}
                        />
                      ))}
                    </ScrollView>
                    <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={eventReminderScrollEdges.showTopFade} />
                    <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={eventReminderScrollEdges.showBottomFade} />
                  </DropdownMenu>
                </View>

                <TouchableOpacity
                  style={[styles.row, styles.rowLast]}
                  onPress={() => setEventSheet('reminderTypes')}
                >
                  <Text style={styles.rowLabel}>{t('settingsScreen.eventReminders.types')}</Text>
                  <Text style={styles.rowValue}>{reminderTypesLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Contacts — Default Contact Method and Preferred Maps App in one card. */}
        <View style={[styles.section, elevatedDropdown === 'method' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>{t('settingsScreen.contacts.sectionTitle')}</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'method' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('method')}
              >
                <Text style={styles.rowLabel}>{t('settingsScreen.defaultContactMethod')}</Text>
                <View style={styles.methodIcon}>
                  <GoalIcon
                    icon={CONTACT_METHODS[selectedMethod].icon}
                    iconFamily={CONTACT_METHODS[selectedMethod].iconFamily}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </View>
                <Text style={styles.rowValue}>{t(`contactMethods.${selectedMethod}`, { defaultValue: CONTACT_METHODS[selectedMethod].label })}</Text>
                <Ionicons
                  name={openDropdown === 'method' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'method'}>
                {DEFAULT_METHOD_CHOICES.map((key, i, arr) => (
                  <DropdownItem
                    key={key}
                    label={t(`contactMethods.${key}`, { defaultValue: CONTACT_METHODS[key].label })}
                    selected={selectedMethod === key}
                    showSeparator={i < arr.length - 1}
                    leading={
                      <View style={styles.methodIcon}>
                        <GoalIcon
                          icon={CONTACT_METHODS[key].icon}
                          iconFamily={CONTACT_METHODS[key].iconFamily}
                          size={18}
                          color={selectedMethod === key ? Colors.control : Colors.textSecondary}
                        />
                      </View>
                    }
                    onPress={() => { updateSettings({ defaultContactMethod: key }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>
            <View style={[styles.row, Platform.OS !== 'ios' && styles.rowLast]}>
              <Text style={styles.rowLabel}>{t('settingsScreen.autoOpenContactReport')}</Text>
              <Switch
                value={settings.autoOpenContactReport}
                onValueChange={value => updateSettings({ autoOpenContactReport: value })}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Maps — iOS only. Android has no choice to offer: an address
                there always opens in Google Maps. */}
            {Platform.OS === 'ios' && (
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.rowLabel}>{t('settingsScreen.preferredMapsApp')}</Text>
                <View style={styles.prefPills}>
                  {MAPS_APP_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.pillSmall, settings.mapsApp === option.key && styles.pillActive]}
                      onPress={() => updateSettings({ mapsApp: option.key })}
                    >
                      <Text style={[styles.pillTextSmall, settings.mapsApp === option.key && styles.pillTextActive]}>
                        {t(`settingsScreen.mapsApp.${option.key}`, { defaultValue: option.label })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Dev Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEV TOOLS</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleResetWeek}>
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Reset Counts & Targets</Text>
              <Ionicons name="refresh" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                Alert.alert(
                  'Reset Settings to Default',
                  'This will reset every setting on this screen — theme, week start, theme colors, all event colors, default durations, the default contact method, schedule hours, event size, maps app, and notification reminders — along with the built-in Goals and Event Types (labels, icons, colors, links, targets), including restoring any that were deleted, to their original values. Your custom Goals, Event Types, counts, and events will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        updateSettings(DEFAULT_SETTINGS);
                        resetBuiltInDefinitions();
                        resetBuiltInEventTypeDefinitions();
                      },
                    },
                  ],
                  { cancelable: true }
                )
              }
            >
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Reset Settings to Default</Text>
              <Ionicons name="refresh-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={() =>
                Alert.alert(
                  'Delete All Events',
                  'This will permanently delete every event on your calendar. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete All', style: 'destructive', onPress: deleteAllEvents },
                  ],
                  { cancelable: true }
                )
              }
            >
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Delete All Events</Text>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settingsScreen.account')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={() =>
                Alert.alert(
                  t('settingsScreen.signOutTitle'),
                  t('settingsScreen.signOutBody'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('settingsScreen.signOutTitle'), style: 'destructive', onPress: handleSignOut },
                  ],
                  { cancelable: true }
                )
              }
            >
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>{t('settingsScreen.signOutTitle')}</Text>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settingsScreen.about')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settingsScreen.appName')}</Text>
              <Text style={styles.rowValue}>RM Calendar</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settingsScreen.version')}</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
            <TouchableOpacity style={styles.row} onPress={replayOnboarding}>
              <Text style={styles.rowLabel}>{t('settingsScreen.replayOnboarding')}</Text>
              <Ionicons name="play-circle-outline" size={18} color={Colors.textLight} />
            </TouchableOpacity>
            <View style={[styles.row, styles.scriptureRow]}>
              <Text style={styles.scripture}>
                {t('settingsScreen.scriptureQuote')}
              </Text>
              <Text style={styles.scriptureRef}>{t('settingsScreen.scriptureRef')}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* All three sit outside the ScrollView: each is its own Modal, so nothing
          here clips them and the scroll position underneath is left alone. */}
      <ColorPickerSheet
        visible={colorSheetRow !== undefined}
        color={
          colorSheetRow
            ? normalizeHex(settings[colorSheetRow.settingKey]) ?? colorSheetRow.defaultValue
            : DEFAULT_THEME_COLOR
        }
        title={colorSheetRow ? t(`themeColorRows.${colorSheetRow.key}`, { defaultValue: colorSheetRow.label }) : undefined}
        defaultColor={colorSheetRow?.defaultValue}
        onCancel={() => setColorSheet(null)}
        onDone={hex => {
          if (colorSheetRow) {
            updateSettings({ [colorSheetRow.settingKey]: hex } as Partial<AppSettings>);
          }
          setColorSheet(null);
        }}
      />

      <QuickAddTypesModal visible={eventSheet === 'quickAdd'} onClose={() => setEventSheet(null)} />
      <EventTypesModal
        visible={eventSheet === 'types'}
        onClose={() => setEventSheet(null)}
        definitions={allEventTypeDefinitions}
        onUpdateDefinitions={updateEventTypeDefinitions}
        goalDefinitions={goalDefinitions}
      />
      <ReorderEventTypesModal
        visible={eventSheet === 'reorder'}
        onClose={() => setEventSheet(null)}
        definitions={allEventTypeDefinitions}
        onUpdateDefinitions={updateEventTypeDefinitions}
      />
      <EventReminderTypesModal visible={eventSheet === 'reminderTypes'} onClose={() => setEventSheet(null)} />
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 60,
      backgroundColor: C.primary,
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: C.onPrimary },
    scroll: { flex: 1, backgroundColor: C.background },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 0.8,
      marginBottom: 8,
      marginLeft: 4,
    },
    // No overflow: 'hidden' — five of these cards float a dropdown out past
    // their own bottom edge (see floatingDropdown below), the same way
    // AddEditEventModal's card does for its pickers. Harmless for every other
    // card here: nothing else in one has a background that would otherwise
    // need clipping to the rounded corners.
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
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
    // Week Start / Preferred Maps App — a label plus a small pill per option,
    // same shape as onboarding's own Theme/Week Start rows (prefRow/
    // prefPills there).
    prefPills: { flexDirection: 'row', gap: 8 },
    pillSmall: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: C.contactActionBg,
    },
    pillActive: { backgroundColor: C.control },
    pillTextSmall: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
    pillTextActive: { color: C.white },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
    // Fixed width so the labels line up despite the glyphs differing in width.
    methodIcon: { width: 24, alignItems: 'center', marginRight: 6 },
    // Theme Colors summary row — a small dot per colour, so the collapsed
    // row still previews each one without expanding.
    dotPreviewRow: { flexDirection: 'row', marginRight: 4 },
    dotPreview: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginLeft: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    // Color Scheme menu item's leading preview — three dots for
    // theme/secondary/tertiary, ahead of the label. Owns its own right
    // margin, per DropdownItem's `leading` contract.
    schemeDotsRow: { flexDirection: 'row', marginRight: 10 },
    schemeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    dropdownList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    // TimeWheelPicker draws its own bordered card; this just gives it the
    // same inset the Date/Start/End wheels get inside AddEditEventModal's
    // "group" rather than sitting flush against the row above.
    timeWheelPanel: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: C.card,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    dropdownItemText: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    // Floating dropdowns are drawn by DropdownMenu now; all that is left here
    // is the stacking they need from this screen.
    //
    // fieldRow/fieldRowOpen: a trigger's wrapper needs a higher zIndex than the
    // sibling row beneath it in the same card, or the menu would paint behind
    // it. Both are driven by `elevatedDropdown`, not `openDropdown` — see its
    // comment for why the distinction matters now that menus animate out.
    fieldRow: { zIndex: 20 },
    fieldRowOpen: { zIndex: 30 },
    // Lifts the whole section above the ones that follow it in the ScrollView
    // — without this, a dropdown floating out of an earlier section would
    // still paint behind a later section's card, since siblings with equal
    // zIndex stack in document order.
    sectionFloating: { zIndex: 2 },
    // Dismisses whichever floating dropdown is open on an outside tap. Covers
    // the full scroll content (not just the viewport), same as the reference
    // pickerBackdrop — bottom: 0 anchors to the content container's edge.
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 1,
    },
    scriptureRow: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      paddingVertical: 16,
      borderBottomWidth: 0,
    },
    scripture: {
      fontSize: 14,
      color: C.textSecondary,
      fontStyle: 'italic',
      lineHeight: 22,
    },
    scriptureRef: {
      fontSize: 12,
      color: C.textLight,
      marginTop: 4,
      alignSelf: 'flex-end',
    },
  });
}
