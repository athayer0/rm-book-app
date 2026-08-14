import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, TextInput, Platform, useColorScheme, Switch, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import {
  EventColors, EventTypeConfig, DEFAULT_THEME_COLOR,
  DEFAULT_SECONDARY_COLOR_LIGHT, DEFAULT_SECONDARY_COLOR_DARK,
  DEFAULT_TERTIARY_COLOR_LIGHT, DEFAULT_TERTIARY_COLOR_DARK,
} from '../constants/colors';
import { EventSizes, EVENT_SIZE_OPTIONS, resolveEventSize, eventSizePercent } from '../constants/eventSizes';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { DropdownMenu, DropdownItem, Collapsible, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';
import { EventColorsModal } from '../modals/EventColorsModal';
import { EventDurationsModal } from '../modals/EventDurationsModal';
import { normalizeHex } from '../utils/colorUtils';
import { useSettings, DEFAULT_SETTINGS, type AppSettings } from '../hooks/useSettings';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { eventTypeColor, eventTypeDefaultMinutes } from '../utils/eventUtils';
import { useAuth } from '../lib/AuthContext';
import { MAPS_APP_OPTIONS } from '../utils/mapUtils';
import { CONTACT_METHODS, DEFAULT_CONTACT_METHOD, DEFAULT_METHOD_CHOICES } from '../constants/contactMethods';
import { GoalIcon } from '../components/GoalIcon';
import { TimeWheelPicker } from '../components/TimeWheelPicker';
import { formatTime, parseTimeString } from '../utils/dateUtils';
import { EVENT_REMINDER_MINUTE_OPTIONS, eventReminderLabel } from '../constants/eventReminders';
import { requestNotificationPermissions, scheduleDailyReview, cancelDailyReview } from '../lib/notifications';

const START_HOUR_OPTIONS = [4, 5, 6, 7, 8, 9, 10];
const END_HOUR_OPTIONS = [21, 22, 23, 24];

// The only dropdown in this screen long enough to need capping — twelve rows
// unbounded runs off the bottom of shorter phones. Ends on half a row rather
// than a whole one, same as the status picker's list, so what's left says
// "more below" without needing a visible scrollbar to say it.
const EVENT_REMINDER_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 4.5;

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const EVENT_TYPES = Object.keys(EventColors);

// Every top-level dropdown/picker on this screen, so at most one can be open
// at a time — opening one closes whichever else was open, rather than each
// tracking its own independent boolean.
type DropdownKey =
  | 'hourStart' | 'hourEnd' | 'size' | 'theme' | 'dailyReviewTime' | 'eventReminderLead'
  | 'colors' | 'method';

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

type ThemeColorRowKey = 'primary' | 'secondaryLight' | 'secondaryDark' | 'tertiaryLight' | 'tertiaryDark';
type ThemeColorSettingKey =
  | 'themeColor' | 'secondaryColorLight' | 'secondaryColorDark'
  | 'tertiaryColorLight' | 'tertiaryColorDark';

// Primary repaints headers/tabs/now-line. Secondary drives `accent` (Save,
// Done, EDIT, goal counts). Tertiary drives `control` (checkmarks, switches,
// active pills/tabs, the FAB, "add a thing" links). Light/dark variants of
// secondary and tertiary are independent settings — no auto dark-mode lift —
// so each needs its own entry. `mode` is undefined for primary (it applies to
// both themes at once) and 'light'/'dark' for the rest, so the settings
// screen can only surface the variant that's actually in effect right now —
// editing the dark accent while looking at the light theme would be editing
// a colour you can't see change.
const THEME_COLOR_ROWS: {
  key: ThemeColorRowKey;
  label: string;
  settingKey: ThemeColorSettingKey;
  defaultValue: string;
  mode?: 'light' | 'dark';
}[] = [
  { key: 'primary', label: 'Primary Color', settingKey: 'themeColor', defaultValue: DEFAULT_THEME_COLOR },
  { key: 'secondaryLight', label: 'Secondary Color (Light)', settingKey: 'secondaryColorLight', defaultValue: DEFAULT_SECONDARY_COLOR_LIGHT, mode: 'light' },
  { key: 'secondaryDark', label: 'Secondary Color (Dark)', settingKey: 'secondaryColorDark', defaultValue: DEFAULT_SECONDARY_COLOR_DARK, mode: 'dark' },
  { key: 'tertiaryLight', label: 'Tertiary Color (Light)', settingKey: 'tertiaryColorLight', defaultValue: DEFAULT_TERTIARY_COLOR_LIGHT, mode: 'light' },
  { key: 'tertiaryDark', label: 'Tertiary Color (Dark)', settingKey: 'tertiaryColorDark', defaultValue: DEFAULT_TERTIARY_COLOR_DARK, mode: 'dark' },
];

export function SettingsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { settings, updateSettings } = useSettings();
  const { resetAll, resetBuiltInDefinitions } = useWeeklyGoals();
  const { deleteAllEvents } = useCalendarEvents();
  const { signOut } = useAuth();
  // Same resolution useColors() does internally — needed here too so the
  // theme-color list can show only the variant that's actually in effect.
  const systemScheme = useColorScheme();
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemScheme === 'dark');
  // Primary always shows; secondary/tertiary show only their current-theme variant.
  const visibleColorRows = THEME_COLOR_ROWS.filter(row => !row.mode || row.mode === (isDark ? 'dark' : 'light'));
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const eventReminderScrollEdges = useScrollEdges();
  // Which theme colour the picker sheet is editing, if any.
  const [colorSheet, setColorSheet] = useState<ThemeColorRowKey | null>(null);
  // Which of the two event-type screens is open.
  const [eventSheet, setEventSheet] = useState<'colors' | 'durations' | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Content-relative y of the country-code section, from its onLayout.
  const codeSectionY = useRef(0);

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

  /**
   * Put the country-code section a fixed distance below the top of the viewport
   * instead of leaving the destination to the platform's scroll-to-focus, which
   * overshoots on a list this long. Runs after the keyboard animation so it has
   * the last word, and scrollTo clamps to the content, so the section cannot end
   * up off screen however far down the list it sits.
   */
  function revealCodeField() {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, codeSectionY.current - 60), animated: true });
    }, 250);
  }
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
        'Signed out — local data kept',
        `${pending} change${pending === 1 ? '' : 's'} could not be synced, so this device's copy was left in place. Reconnect and sign in again to finish syncing.`,
      );
    }
  }

  // Requesting/scheduling here (rather than leaving it to App.tsx's settings-
  // driven effect alone) is what lets a denied permission stay off instead of
  // silently sitting "on" with nothing scheduled — the effect still runs too,
  // but by then permission is already resolved, so it's a no-op.
  async function handleToggleDailyReview(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications for RM Book in your device settings to use the daily review reminder.',
        );
        return;
      }
      await scheduleDailyReview(settings.dailyReviewHour, settings.dailyReviewMinute);
      updateSettings({ dailyReviewEnabled: true });
    } else {
      await cancelDailyReview();
      updateSettings({ dailyReviewEnabled: false });
    }
  }

  async function handleSelectDailyReviewTime(t: string) {
    const { hour, minute } = parseTimeString(t);
    updateSettings({ dailyReviewHour: hour, dailyReviewMinute: minute });
    if (settings.dailyReviewEnabled) await scheduleDailyReview(hour, minute);
  }

  // Scheduling itself happens in App.tsx's settings-driven effect (it needs
  // the full event list, which this screen has no reason to load) — this
  // just gates the permission request the same way the daily review toggle
  // does, so a denial leaves the switch off instead of on with nothing
  // scheduled.
  async function handleToggleEventReminders(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications for RM Book in your device settings to use event reminders.',
        );
        return;
      }
    }
    updateSettings({ eventReminderEnabled: value });
  }

  function handleResetWeek() {
    Alert.alert('Reset Week', 'This will clear all goal counts for the current week. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAll },
    ]);
  }

  // Per-type editing lives in EventColorsModal / EventDurationsModal. The bulk
  // resets stay here rather than travelling with it: those lists are sized to
  // fill their sheet exactly with no scroll, so there is nowhere to put a reset
  // panel inside one, and a reset is a thing you do to the whole set anyway.
  const effectiveColor = (type: string) => eventTypeColor(type, settings.eventTypeColors);
  const effectiveMinutes = (type: string) =>
    eventTypeDefaultMinutes(type, settings.eventTypeDefaultMinutes);
  const stockMinutes = (type: string) => EventTypeConfig[type]?.defaultMinutes ?? 30;

  // A type is "customized" by what it resolves to, not by whether it has an
  // override: one set back to the stock value by hand has nothing to reset.
  const customizedColorTypes = EVENT_TYPES.filter(t => effectiveColor(t) !== EventColors[t]);

  // Types with no duration to offer at all have nothing to be customized —
  // effectiveMinutes is already null for them.
  const customizedDurationTypes = EVENT_TYPES.filter(t => {
    const mins = effectiveMinutes(t);
    return mins !== null && mins !== stockMinutes(t);
  });

  // Both resets are all-or-nothing and confirmed by an alert rather than a panel
  // of checkboxes. The alert names the count, since the row itself no longer
  // shows which types are affected — and the same alert pattern already guards
  // the destructive rows further down this screen.
  function confirmResetEventColors() {
    const n = customizedColorTypes.length;
    Alert.alert(
      'Reset Event Colors',
      n === 1
        ? '1 event type will go back to its original color. This cannot be undone.'
        : `${n} event types will go back to their original colors. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
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
      'Reset Default Durations',
      n === 1
        ? '1 event type will go back to its original duration. This cannot be undone.'
        : `${n} event types will go back to their original durations. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
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

  const colorSheetRow = THEME_COLOR_ROWS.find(row => row.key === colorSheet);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* automaticallyAdjustKeyboardInsets, as on every other scroll in the app,
          so focused content can clear the keyboard. Where it lands is decided by
          revealCodeField() rather than by the platform. */}
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

        {/* Theme — collapsed to one row, same shape as Event Size / Contact
            Method, instead of all three options sitting on the screen. */}
        <View style={[styles.section, elevatedDropdown === 'theme' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>THEME</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'theme' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleDropdown('theme')}
              >
                <Text style={styles.rowLabel}>Mode</Text>
                <Text style={styles.rowValue}>
                  {settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
                </Text>
                <Ionicons
                  name={openDropdown === 'theme' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'theme'}>
                {(['light', 'dark', 'system'] as const).map((theme, i, arr) => (
                  <DropdownItem
                    key={theme}
                    label={theme.charAt(0).toUpperCase() + theme.slice(1)}
                    selected={settings.theme === theme}
                    showSeparator={i < arr.length - 1}
                    onPress={() => { updateSettings({ theme }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>
          </View>
        </View>

        {/* Theme Colors — see THEME_COLOR_ROWS for what each one drives.
            Collapsed behind one summary row (dot strip previews all five),
            expanding into the same indented dropdown-item list Schedule
            Hours and Contact Method use. Each item still opens its own
            picker panel underneath, exactly as before. */}
        {/* No lift for `colors`: no backdrop goes up for it, so there is
            nothing for the section to need lifting over. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>THEME COLORS</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, openDropdown !== 'colors' && styles.rowLast]}
              onPress={() => toggleDropdown('colors')}
            >
              <Text style={styles.rowLabel}>Customize Colors</Text>
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
              <View style={[styles.dropdownList, styles.dropdownListLast]}>
                {visibleColorRows.map((row, i, arr) => {
                  // The dot is the value; the hex it happens to have said
                  // nothing the colour itself doesn't.
                  const value = normalizeHex(settings[row.settingKey]) ?? row.defaultValue;
                  return (
                    <TouchableOpacity
                      key={row.key}
                      style={[styles.dropdownItem, i === arr.length - 1 && styles.dropdownItemLast]}
                      onPress={() => setColorSheet(row.key)}
                    >
                      <View style={[styles.colorDot, { backgroundColor: value }]} />
                      <Text style={styles.dropdownItemText}>{row.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Collapsible>
          </View>
        </View>

        {/* Event Size — collapsed to one row and expanded on tap, the same
            shape as Start Time / End Time above, instead of every option
            sitting on the screen at once. */}
        <View style={[styles.section, elevatedDropdown === 'size' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>EVENT SIZE</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'size' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleDropdown('size')}
              >
                <Text style={styles.rowLabel}>Size</Text>
                <Text style={styles.rowValue}>
                  {EventSizes[selectedEventSize].label} ({eventSizePercent(selectedEventSize)}%)
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
                    label={`${EventSizes[size].label} (${eventSizePercent(size)}%)`}
                    selected={selectedEventSize === size}
                    showSeparator={i < arr.length - 1}
                    onPress={() => { updateSettings({ eventSize: size }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>
          </View>
        </View>

        {/* Daily Review Reminder — a local notification, off by default, that
            opens straight to the unreported-events backlog when tapped. */}
        {/* No lift: the time wheel opens in the flow, so no backdrop goes up
            for it and there is nothing for the section to rise over. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DAILY REVIEW</Text>
          <View style={styles.card}>
            <View style={[styles.row, !settings.dailyReviewEnabled && styles.rowLast]}>
              <Text style={styles.rowLabel}>Notifications</Text>
              <Switch
                value={settings.dailyReviewEnabled}
                onValueChange={handleToggleDailyReview}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {settings.dailyReviewEnabled && (
              <>
                <TouchableOpacity
                  style={[styles.row, openDropdown !== 'dailyReviewTime' && styles.rowLast]}
                  onPress={() => toggleDropdown('dailyReviewTime')}
                >
                  <Text style={styles.rowLabel}>Time</Text>
                  <Text style={styles.rowValue}>
                    {formatTime(settings.dailyReviewHour, settings.dailyReviewMinute)}
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
          </View>
        </View>

        {/* Event Reminders — a second, independent local notification: one
            per upcoming event occurrence rather than a single daily one. */}
        <View style={[styles.section, elevatedDropdown === 'eventReminderLead' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>EVENT REMINDERS</Text>
          <View style={styles.card}>
            <View style={[styles.row, !settings.eventReminderEnabled && styles.rowLast]}>
              <Text style={styles.rowLabel}>Notifications</Text>
              <Switch
                value={settings.eventReminderEnabled}
                onValueChange={handleToggleEventReminders}
                trackColor={{ true: Colors.control }}
                thumbColor={Colors.white}
              />
            </View>
            {settings.eventReminderEnabled && (
              <View style={[styles.fieldRow, elevatedDropdown === 'eventReminderLead' && styles.fieldRowOpen]}>
                <TouchableOpacity
                  style={[styles.row, styles.rowLast]}
                  onPress={() => toggleDropdown('eventReminderLead')}
                >
                  <Text style={styles.rowLabel}>Time Before</Text>
                  <Text style={styles.rowValue}>{eventReminderLabel(settings.eventReminderMinutes)}</Text>
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
                        label={eventReminderLabel(minutes)}
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
            )}
          </View>
        </View>

        {/* Week Start */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WEEK START</Text>
          <View style={styles.card}>
            {(['sunday', 'monday'] as const).map(day => (
              <TouchableOpacity
                key={day}
                style={styles.row}
                onPress={() => updateSettings({ weekStart: day })}
              >
                <Text style={styles.rowLabel}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                {settings.weekStart === day && (
                  <Ionicons name="checkmark" size={18} color={Colors.control} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Schedule Hours */}
        <View style={[styles.section, (elevatedDropdown === 'hourStart' || elevatedDropdown === 'hourEnd') && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>SCHEDULE HOURS</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'hourStart' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggleDropdown('hourStart')}
              >
                <Text style={styles.rowLabel}>Start Time</Text>
                <Text style={styles.rowValue}>{hourLabel(settings.gridStartHour)}</Text>
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
                    label={hourLabel(h)}
                    selected={settings.gridStartHour === h}
                    showSeparator={i < START_HOUR_OPTIONS.length - 1}
                    onPress={() => { updateSettings({ gridStartHour: h }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>

            <View style={[styles.fieldRow, elevatedDropdown === 'hourEnd' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleDropdown('hourEnd')}
              >
                <Text style={styles.rowLabel}>End Time</Text>
                <Text style={styles.rowValue}>{hourLabel(settings.gridEndHour)}</Text>
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
                    label={hourLabel(h)}
                    selected={settings.gridEndHour === h}
                    showSeparator={i < END_HOUR_OPTIONS.length - 1}
                    onPress={() => { updateSettings({ gridEndHour: h }); setOpenDropdown(null); }}
                  />
                ))}
              </DropdownMenu>
            </View>
          </View>
        </View>

        {/* Event Colors and Default Durations — one setting each, on a screen of
            their own. They used to share a "Customize Types" panel per type,
            which meant scrolling past every colour to reach a duration and
            expanding a picker that pushed fourteen rows down the list. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT COLORS</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => setEventSheet('colors')}>
              <Text style={styles.rowLabel}>Customize</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              disabled={customizedColorTypes.length === 0}
              onPress={confirmResetEventColors}
            >
              <Text
                style={[
                  styles.rowLabel,
                  // Reads as a row like every other one on this screen when it
                  // is live, and greys out when there is nothing to undo.
                  { color: customizedColorTypes.length ? Colors.text : Colors.textLight },
                ]}
              >
                Reset to Default
              </Text>
              {/* The greyed label and icon are the whole disabled state now —
                  nothing to reset reads clearly enough without saying so. */}
              <Ionicons
                name="refresh"
                size={16}
                color={customizedColorTypes.length ? Colors.textLight : Colors.border}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT DEFAULT DURATIONS</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => setEventSheet('durations')}>
              <Text style={styles.rowLabel}>Customize</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              disabled={customizedDurationTypes.length === 0}
              onPress={confirmResetEventDurations}
            >
              <Text
                style={[
                  styles.rowLabel,
                  { color: customizedDurationTypes.length ? Colors.text : Colors.textLight },
                ]}
              >
                Reset to Default
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={customizedDurationTypes.length ? Colors.textLight : Colors.border}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Default Contact Method. The section title names the setting, so the
            row carries the value alone rather than repeating it as a label. */}
        <View style={[styles.section, elevatedDropdown === 'method' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>DEFAULT CONTACT METHOD</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, elevatedDropdown === 'method' && styles.fieldRowOpen]}>
              <TouchableOpacity
                style={[styles.row, styles.rowLast]}
                onPress={() => toggleDropdown('method')}
              >
                <View style={styles.methodIcon}>
                  <GoalIcon
                    icon={CONTACT_METHODS[selectedMethod].icon}
                    iconFamily={CONTACT_METHODS[selectedMethod].iconFamily}
                    size={18}
                    color={Colors.textSecondary}
                  />
                </View>
                <Text style={styles.rowLabel}>{CONTACT_METHODS[selectedMethod].label}</Text>
                <Ionicons
                  name={openDropdown === 'method' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
              <DropdownMenu open={openDropdown === 'method'}>
                {DEFAULT_METHOD_CHOICES.map((key, i, arr) => (
                  <DropdownItem
                    key={key}
                    label={CONTACT_METHODS[key].label}
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
          </View>
        </View>

        {/* Default Country Code */}
        <View
          style={styles.section}
          onLayout={e => { codeSectionY.current = e.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>DEFAULT COUNTRY CODE</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowLast]}>
              <TextInput
                style={styles.codeInput}
                value={settings.defaultCountryCode}
                onChangeText={text => {
                  // Normalised on the way in so the stored value is always the
                  // '+NN' the hint in the person editor claims it is.
                  const digits = text.replace(/\D/g, '').slice(0, 4);
                  updateSettings({ defaultCountryCode: digits ? `+${digits}` : '' });
                }}
                placeholder="+1"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                maxLength={5}
                onFocus={revealCodeField}
              />
            </View>
          </View>
          <Text style={styles.sectionFootnote}>
            Used for WhatsApp numbers saved without a + code.
          </Text>
        </View>

        {/* Maps — iOS only. Android has no choice to offer: an address there
            always opens in Google Maps. */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PREFERRED MAPS APP</Text>
            <View style={styles.card}>
              {MAPS_APP_OPTIONS.map((option, i, arr) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.row, i === arr.length - 1 && styles.rowLast]}
                  onPress={() => updateSettings({ mapsApp: option.key })}
                >
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {settings.mapsApp === option.key && (
                    <Ionicons name="checkmark" size={18} color={Colors.control} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleResetWeek}>
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Reset Current Week</Text>
              <Ionicons name="refresh" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                Alert.alert(
                  'Reset Settings to Default',
                  'This will reset every setting on this screen — theme, week start, theme colors, all event colors, default durations, the default contact method, schedule hours, event size, country code, maps app, and notification reminders — along with the built-in Goals (labels, icons, colors, targets) to their original values. Your custom Goals, counts, and events will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        updateSettings(DEFAULT_SETTINGS);
                        resetBuiltInDefinitions();
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
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={() =>
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
                  ],
                  { cancelable: true }
                )
              }
            >
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Sign Out</Text>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>App Name</Text>
              <Text style={styles.rowValue}>RM Book</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
            <View style={[styles.row, styles.scriptureRow]}>
              <Text style={styles.scripture}>
                "But be ye doers of the word, and not hearers only."
              </Text>
              <Text style={styles.scriptureRef}>— James 1:22</Text>
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
        title={colorSheetRow?.label}
        defaultColor={colorSheetRow?.defaultValue}
        onCancel={() => setColorSheet(null)}
        onDone={hex => {
          if (colorSheetRow) {
            updateSettings({ [colorSheetRow.settingKey]: hex } as Partial<AppSettings>);
          }
          setColorSheet(null);
        }}
      />

      <EventColorsModal visible={eventSheet === 'colors'} onClose={() => setEventSheet(null)} />
      <EventDurationsModal visible={eventSheet === 'durations'} onClose={() => setEventSheet(null)} />
    </SafeAreaView>
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
    codeInput: {
      flex: 1,
      fontSize: 15,
      color: C.text,
      paddingVertical: 0,
    },
    sectionFootnote: {
      fontSize: 12,
      color: C.textLight,
      marginTop: 8,
      marginLeft: 4,
    },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
    // Fixed width so the labels line up despite the glyphs differing in width.
    methodIcon: { width: 24, alignItems: 'center', marginRight: 6 },
    // Theme Colors summary row — a small dot per colour, so the collapsed
    // row still previews all five without expanding.
    dotPreviewRow: { flexDirection: 'row', marginRight: 4 },
    dotPreview: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginLeft: 4,
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
    },
    dropdownListLast: {
      borderBottomWidth: 0,
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
    // Same reasoning as expandedPanelLast above.
    dropdownItemLast: {
      borderBottomWidth: 0,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
    },
    dropdownItemText: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    // Floating dropdowns — Schedule Hours, Event Size, Theme, Time Before, and
    // Default Contact Method — are drawn by DropdownMenu now; all that is left
    // here is the stacking they need from this screen.
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
