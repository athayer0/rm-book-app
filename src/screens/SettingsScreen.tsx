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
  EventColors, EventTypeLabels, EventTypeConfig, DEFAULT_THEME_COLOR,
  DEFAULT_SECONDARY_COLOR_LIGHT, DEFAULT_SECONDARY_COLOR_DARK,
  DEFAULT_TERTIARY_COLOR_LIGHT, DEFAULT_TERTIARY_COLOR_DARK,
} from '../constants/colors';
import { EventSizes, EVENT_SIZE_OPTIONS, DEFAULT_EVENT_SIZE, resolveEventSize, eventSizePercent } from '../constants/eventSizes';
import { GradientColorPicker } from '../components/GradientColorPicker';
import { DurationSlider, durationLabel } from '../components/DurationSlider';
import { normalizeHex } from '../utils/colorUtils';
import { useSettings, type AppSettings } from '../hooks/useSettings';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { isCheckboxType, hasOptionalEnd } from '../utils/eventUtils';
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
  | 'colors' | 'types' | 'method';

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
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [expandedColor, setExpandedColor] = useState<ThemeColorRowKey | null>(null);
  const [colorResetOpen, setColorResetOpen] = useState(false);
  // The types deliberately spared, so everything listed starts checked.
  const [keptTypes, setKeptTypes] = useState<string[]>([]);
  const [durationResetOpen, setDurationResetOpen] = useState(false);
  const [keptDurationTypes, setKeptDurationTypes] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  // Content-relative y of the country-code section, from its onLayout.
  const codeSectionY = useRef(0);

  function toggleDropdown(key: DropdownKey) {
    setOpenDropdown(prev => (prev === key ? null : key));
  }

  // Schedule Hours, Event Size, Theme, Time Before, and Default Contact Method
  // float their option list over the rows beneath rather than pushing them
  // down (see FLOATING_DROPDOWN_KEYS-style usage below and floatingDropdown
  // in makeStyles) — matching the picker construction AddEditEventModal and
  // AddEditPersonModal already use. A backdrop dismisses whichever of them is
  // open on an outside tap, the same as those two screens.
  const floatingDropdownOpen =
    openDropdown === 'hourStart' || openDropdown === 'hourEnd' || openDropdown === 'size'
    || openDropdown === 'theme' || openDropdown === 'eventReminderLead' || openDropdown === 'method';

  // A row that's mid-edit can go out of view when the theme flips (e.g. the
  // Theme section further down this same screen) — close it rather than
  // leave a picker open for a variant no longer shown.
  useEffect(() => {
    setExpandedColor(null);
  }, [isDark]);

  // The per-row pickers nested inside "Customize Colors"/"Customize Types"
  // belong to those dropdowns — switching to a different top-level dropdown,
  // or closing this one, closes them too rather than leaving them ready to
  // reappear the next time that section reopens.
  useEffect(() => {
    if (openDropdown !== 'colors') setExpandedColor(null);
  }, [openDropdown]);
  useEffect(() => {
    if (openDropdown !== 'types') {
      setExpandedType(null);
      setColorResetOpen(false);
      setKeptTypes([]);
      setDurationResetOpen(false);
      setKeptDurationTypes([]);
    }
  }, [openDropdown]);

  // Leaving Settings for another tab closes every open dropdown, so coming
  // back — or landing on a different tab entirely — never shows one already
  // expanded from a prior visit.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setOpenDropdown(null);
        setExpandedColor(null);
        setExpandedType(null);
        setColorResetOpen(false);
        setKeptTypes([]);
        setDurationResetOpen(false);
        setKeptDurationTypes([]);
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

  function effectiveColor(type: string) {
    return settings.eventTypeColors[type] ?? EventColors[type];
  }

  // null means the type has no default duration to offer — either it can never
  // have one (checkbox types) or it starts without one (optional-end types).
  function effectiveMinutes(type: string): number | null {
    if (isCheckboxType(type) || hasOptionalEnd(type)) return null;
    return settings.eventTypeDefaultMinutes[type] ?? EventTypeConfig[type]?.defaultMinutes ?? 30;
  }

  function setColor(type: string, color: string) {
    updateSettings({ eventTypeColors: { ...settings.eventTypeColors, [type]: color } });
  }

  function setDuration(type: string, minutes: number) {
    updateSettings({ eventTypeDefaultMinutes: { ...settings.eventTypeDefaultMinutes, [type]: minutes } });
  }

  // A type is "customized" by what it resolves to, not by whether it has an
  // override: one set back to the stock colour by hand has nothing to reset.
  const customizedTypes = EVENT_TYPES.filter(type => effectiveColor(type) !== EventColors[type]);
  const typesToReset = customizedTypes.filter(type => !keptTypes.includes(type));

  function resetEventColors() {
    // Deleting the override is the reset — effectiveColor then falls through to
    // EventColors. Writing the stock colour in would leave it looking custom.
    const next = { ...settings.eventTypeColors };
    typesToReset.forEach(type => { delete next[type]; });
    updateSettings({ eventTypeColors: next });
    setColorResetOpen(false);
    setKeptTypes([]);
  }

  // Types with no duration to offer at all (checkbox types, optional-end types)
  // have nothing to be "customized" — effectiveMinutes is already null for them.
  const customizedDurationTypes = EVENT_TYPES.filter(type => {
    const mins = effectiveMinutes(type);
    return mins !== null && mins !== (EventTypeConfig[type]?.defaultMinutes ?? 30);
  });
  const durationTypesToReset = customizedDurationTypes.filter(type => !keptDurationTypes.includes(type));

  function resetEventDurations() {
    // Same shape as resetEventColors: deleting the override lets
    // effectiveMinutes fall through to EventTypeConfig's default.
    const next = { ...settings.eventTypeDefaultMinutes };
    durationTypesToReset.forEach(type => { delete next[type]; });
    updateSettings({ eventTypeDefaultMinutes: next });
    setDurationResetOpen(false);
    setKeptDurationTypes([]);
  }

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
        {floatingDropdownOpen && (
          <Pressable style={styles.pickerBackdrop} onPress={() => setOpenDropdown(null)} />
        )}

        {/* Theme — collapsed to one row, same shape as Event Size / Contact
            Method, instead of all three options sitting on the screen. */}
        <View style={[styles.section, openDropdown === 'theme' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>THEME</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, openDropdown === 'theme' && styles.fieldRowOpen]}>
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
              {openDropdown === 'theme' && (
                <View style={styles.floatingDropdown}>
                  {(['light', 'dark', 'system'] as const).map((theme, i, arr) => (
                    <TouchableOpacity
                      key={theme}
                      style={[styles.floatingDropdownItem, i === arr.length - 1 && styles.floatingDropdownItemLast]}
                      onPress={() => { updateSettings({ theme }); setOpenDropdown(null); }}
                    >
                      <Text style={[styles.floatingDropdownText, settings.theme === theme && styles.floatingDropdownTextActive]}>
                        {theme.charAt(0).toUpperCase() + theme.slice(1)}
                      </Text>
                      {settings.theme === theme && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Theme Colors — see THEME_COLOR_ROWS for what each one drives.
            Collapsed behind one summary row (dot strip previews all five),
            expanding into the same indented dropdown-item list Schedule
            Hours and Contact Method use. Each item still opens its own
            picker panel underneath, exactly as before. */}
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
            {openDropdown === 'colors' && (
              <View style={[styles.dropdownList, !expandedColor && styles.dropdownListLast]}>
                {visibleColorRows.map((row, i, arr) => {
                  const isOpen = expandedColor === row.key;
                  const isLastRow = i === arr.length - 1;
                  // The dot is the value; the hex it happens to have said
                  // nothing the colour itself doesn't.
                  const value = normalizeHex(settings[row.settingKey]) ?? row.defaultValue;
                  return (
                    <View key={row.key}>
                      <TouchableOpacity
                        style={[styles.dropdownItem, !isOpen && isLastRow && styles.dropdownItemLast]}
                        onPress={() => setExpandedColor(isOpen ? null : row.key)}
                      >
                        <View style={[styles.colorDot, { backgroundColor: value }]} />
                        <Text style={styles.dropdownItemText}>{row.label}</Text>
                        <Ionicons
                          name={isOpen ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={Colors.textLight}
                        />
                      </TouchableOpacity>
                      {isOpen && (
                        <View style={[styles.expandedPanel, isLastRow && styles.expandedPanelLast]}>
                          <GradientColorPicker
                            color={value}
                            onChange={hex =>
                              updateSettings({ [row.settingKey]: hex } as Partial<AppSettings>)
                            }
                          />
                          <TouchableOpacity
                            style={styles.resetColorBtn}
                            onPress={() =>
                              updateSettings({ [row.settingKey]: row.defaultValue } as Partial<AppSettings>)
                            }
                          >
                            <Ionicons name="refresh" size={15} color={Colors.control} />
                            <Text style={styles.resetColorText}>Reset to Default Color</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Event Size — collapsed to one row and expanded on tap, the same
            shape as Start Time / End Time above, instead of every option
            sitting on the screen at once. */}
        <View style={[styles.section, openDropdown === 'size' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>EVENT SIZE</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, openDropdown === 'size' && styles.fieldRowOpen]}>
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
              {openDropdown === 'size' && (
                <View style={styles.floatingDropdown}>
                  {EVENT_SIZE_OPTIONS.map((size, i, arr) => (
                    <TouchableOpacity
                      key={size}
                      style={[styles.floatingDropdownItem, i === arr.length - 1 && styles.floatingDropdownItemLast]}
                      onPress={() => { updateSettings({ eventSize: size }); setOpenDropdown(null); }}
                    >
                      <Text style={[styles.floatingDropdownText, selectedEventSize === size && styles.floatingDropdownTextActive]}>
                        {EventSizes[size].label} ({eventSizePercent(size)}%)
                      </Text>
                      {selectedEventSize === size && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
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
        <View style={[styles.section, (openDropdown === 'hourStart' || openDropdown === 'hourEnd') && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>SCHEDULE HOURS</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, openDropdown === 'hourStart' && styles.fieldRowOpen]}>
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
              {openDropdown === 'hourStart' && (
                <View style={styles.floatingDropdown}>
                  {START_HOUR_OPTIONS.map((h, i) => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.floatingDropdownItem, i === START_HOUR_OPTIONS.length - 1 && styles.floatingDropdownItemLast]}
                      onPress={() => { updateSettings({ gridStartHour: h }); setOpenDropdown(null); }}
                    >
                      <Text style={[styles.floatingDropdownText, settings.gridStartHour === h && styles.floatingDropdownTextActive]}>
                        {hourLabel(h)}
                      </Text>
                      {settings.gridStartHour === h && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.fieldRow, openDropdown === 'hourEnd' && styles.fieldRowOpen]}>
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
              {openDropdown === 'hourEnd' && (
                <View style={styles.floatingDropdown}>
                  {END_HOUR_OPTIONS.map((h, i) => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.floatingDropdownItem, i === END_HOUR_OPTIONS.length - 1 && styles.floatingDropdownItemLast]}
                      onPress={() => { updateSettings({ gridEndHour: h }); setOpenDropdown(null); }}
                    >
                      <Text style={[styles.floatingDropdownText, settings.gridEndHour === h && styles.floatingDropdownTextActive]}>
                        {hourLabel(h)}
                      </Text>
                      {settings.gridEndHour === h && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Event Types — collapsed behind one summary row, same as Theme
            Colors above. What expands underneath is the original per-type
            row + panel design (color dot, label, duration badge, its own
            expand), unchanged apart from now sitting inside a dropdownList
            instead of directly in the card. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT TYPES</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, openDropdown !== 'types' && styles.rowLast]}
              onPress={() => toggleDropdown('types')}
            >
              <Text style={styles.rowLabel}>Customize Types</Text>
              <Ionicons
                name={openDropdown === 'types' ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>

            {openDropdown === 'types' && (
              <View style={[styles.dropdownList, styles.dropdownListLast]}>
                {EVENT_TYPES.map(type => {
                  const isExpanded = expandedType === type;
                  const mins = effectiveMinutes(type);
                  const color = effectiveColor(type);
                  return (
                    <View key={type}>
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => setExpandedType(isExpanded ? null : type)}
                      >
                        <View style={[styles.colorDot, { backgroundColor: color }]} />
                        <Text style={styles.dropdownItemText}>{EventTypeLabels[type]}</Text>
                        <Text style={styles.durationBadge}>
                          {mins !== null ? durationLabel(mins) : hasOptionalEnd(type) ? 'Optional' : 'Fixed'}
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={Colors.textLight}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.expandedPanel}>
                          <Text style={styles.panelLabel}>Color</Text>
                          <GradientColorPicker color={color} onChange={c => setColor(type, c)} />

                          {/* Types with no duration to set get no duration section —
                              the collapsed row already says "Optional" or "Fixed". */}
                          {mins !== null && (
                            <>
                              <Text style={[styles.panelLabel, { marginTop: 16 }]}>Default Duration</Text>
                              <DurationSlider minutes={mins} onChange={d => setDuration(type, d)} />
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Reset colors. Lists only the types actually off their default —
                    the rest have nothing to undo, and padding the list with them
                    would hide the ones that do behind fourteen no-ops. */}
                <TouchableOpacity
                  style={styles.dropdownItem}
                  disabled={customizedTypes.length === 0}
                  onPress={() => { setColorResetOpen(v => !v); setKeptTypes([]); }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      { color: customizedTypes.length ? Colors.control : Colors.textLight },
                    ]}
                  >
                    Reset Colors to Default
                  </Text>
                  {customizedTypes.length === 0 ? (
                    <Text style={styles.rowValue}>All default</Text>
                  ) : (
                    <Ionicons
                      name={colorResetOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                    />
                  )}
                </TouchableOpacity>

                {colorResetOpen && customizedTypes.length > 0 && (
                  <View style={styles.expandedPanel}>
                    <Text style={styles.panelLabel}>Uncheck any you want to keep</Text>
                    {customizedTypes.map(type => {
                      const checked = !keptTypes.includes(type);
                      return (
                        <TouchableOpacity
                          key={type}
                          style={styles.resetItem}
                          onPress={() =>
                            setKeptTypes(prev =>
                              prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                            )
                          }
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={checked ? Colors.control : Colors.textLight}
                          />
                          <View style={[styles.colorDot, { backgroundColor: effectiveColor(type), marginLeft: 10 }]} />
                          <Text style={styles.resetItemLabel}>{EventTypeLabels[type]}</Text>
                          {/* The colour it would go back to, so the choice is visible
                              rather than something you have to remember. */}
                          <View style={[styles.colorDot, { backgroundColor: EventColors[type], marginRight: 0 }]} />
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.resetColorBtn, typesToReset.length === 0 && styles.resetColorBtnDisabled]}
                      disabled={typesToReset.length === 0}
                      onPress={resetEventColors}
                    >
                      <Ionicons
                        name="refresh"
                        size={15}
                        color={typesToReset.length ? Colors.control : Colors.textLight}
                      />
                      <Text
                        style={[
                          styles.resetColorText,
                          typesToReset.length === 0 && { color: Colors.textLight },
                        ]}
                      >
                        {typesToReset.length === 1
                          ? 'Reset 1 Color'
                          : `Reset ${typesToReset.length} Colors`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Reset durations. Same shape as Reset Colors above, one row
                    down — a type only appears once its own default duration has
                    actually been changed from EventTypeConfig's. */}
                <TouchableOpacity
                  style={[styles.dropdownItem, !durationResetOpen && styles.dropdownItemLast]}
                  disabled={customizedDurationTypes.length === 0}
                  onPress={() => { setDurationResetOpen(v => !v); setKeptDurationTypes([]); }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      { color: customizedDurationTypes.length ? Colors.control : Colors.textLight },
                    ]}
                  >
                    Reset Durations to Default
                  </Text>
                  {customizedDurationTypes.length === 0 ? (
                    <Text style={styles.rowValue}>All default</Text>
                  ) : (
                    <Ionicons
                      name={durationResetOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                    />
                  )}
                </TouchableOpacity>

                {durationResetOpen && customizedDurationTypes.length > 0 && (
                  <View style={[styles.expandedPanel, styles.expandedPanelLast]}>
                    <Text style={styles.panelLabel}>Uncheck any you want to keep</Text>
                    {customizedDurationTypes.map(type => {
                      const checked = !keptDurationTypes.includes(type);
                      const mins = effectiveMinutes(type);
                      return (
                        <TouchableOpacity
                          key={type}
                          style={styles.resetItem}
                          onPress={() =>
                            setKeptDurationTypes(prev =>
                              prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                            )
                          }
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={checked ? Colors.control : Colors.textLight}
                          />
                          <Text style={[styles.resetItemLabel, { marginLeft: 10 }]}>{EventTypeLabels[type]}</Text>
                          {/* Current duration, then the default it would go back
                              to — so the choice is visible rather than something
                              you have to remember, same as the colour dots above. */}
                          <Text style={styles.durationBadge}>{mins !== null ? durationLabel(mins) : ''}</Text>
                          <Ionicons name="arrow-forward" size={12} color={Colors.textLight} style={{ marginHorizontal: 4 }} />
                          <Text style={styles.durationBadge}>
                            {durationLabel(EventTypeConfig[type]?.defaultMinutes ?? 30)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.resetColorBtn, durationTypesToReset.length === 0 && styles.resetColorBtnDisabled]}
                      disabled={durationTypesToReset.length === 0}
                      onPress={resetEventDurations}
                    >
                      <Ionicons
                        name="refresh"
                        size={15}
                        color={durationTypesToReset.length ? Colors.control : Colors.textLight}
                      />
                      <Text
                        style={[
                          styles.resetColorText,
                          durationTypesToReset.length === 0 && { color: Colors.textLight },
                        ]}
                      >
                        {durationTypesToReset.length === 1
                          ? 'Reset 1 Duration'
                          : `Reset ${durationTypesToReset.length} Durations`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Default Contact Method. The section title names the setting, so the
            row carries the value alone rather than repeating it as a label. */}
        <View style={[styles.section, openDropdown === 'method' && styles.sectionFloating]}>
          <Text style={styles.sectionTitle}>DEFAULT CONTACT METHOD</Text>
          <View style={styles.card}>
            <View style={[styles.fieldRow, openDropdown === 'method' && styles.fieldRowOpen]}>
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
              {openDropdown === 'method' && (
                <View style={styles.floatingDropdown}>
                  {DEFAULT_METHOD_CHOICES.map((key, i, arr) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.floatingDropdownItem, i === arr.length - 1 && styles.floatingDropdownItemLast]}
                      onPress={() => { updateSettings({ defaultContactMethod: key }); setOpenDropdown(null); }}
                    >
                      <View style={styles.methodIcon}>
                        <GoalIcon
                          icon={CONTACT_METHODS[key].icon}
                          iconFamily={CONTACT_METHODS[key].iconFamily}
                          size={18}
                          color={selectedMethod === key ? Colors.control : Colors.textSecondary}
                        />
                      </View>
                      <Text style={[styles.floatingDropdownText, selectedMethod === key && styles.floatingDropdownTextActive]}>
                        {CONTACT_METHODS[key].label}
                      </Text>
                      {selectedMethod === key && (
                        <Ionicons name="checkmark" size={16} color={Colors.control} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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

        {/* Daily Review Reminder — a local notification, off by default, that
            opens straight to the unreported-events backlog when tapped. */}
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
                {openDropdown === 'dailyReviewTime' && (
                  <View style={styles.timeWheelPanel}>
                    <TimeWheelPicker
                      value={formatTime(settings.dailyReviewHour, settings.dailyReviewMinute)}
                      onChange={handleSelectDailyReviewTime}
                    />
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Event Reminders — a second, independent local notification: one
            per upcoming event occurrence rather than a single daily one. */}
        <View style={[styles.section, openDropdown === 'eventReminderLead' && styles.sectionFloating]}>
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
              <View style={[styles.fieldRow, openDropdown === 'eventReminderLead' && styles.fieldRowOpen]}>
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
                {openDropdown === 'eventReminderLead' && (
                  <View style={styles.floatingDropdown}>
                    {EVENT_REMINDER_MINUTE_OPTIONS.map((minutes, i, arr) => (
                      <TouchableOpacity
                        key={minutes}
                        style={[styles.floatingDropdownItem, i === arr.length - 1 && styles.floatingDropdownItemLast]}
                        onPress={() => { updateSettings({ eventReminderMinutes: minutes }); setOpenDropdown(null); }}
                      >
                        <Text style={[styles.floatingDropdownText, settings.eventReminderMinutes === minutes && styles.floatingDropdownTextActive]}>
                          {eventReminderLabel(minutes)}
                        </Text>
                        {settings.eventReminderMinutes === minutes && (
                          <Ionicons name="checkmark" size={16} color={Colors.control} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

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
                  'This will reset the theme colors, all event colors, default durations, the default contact method, schedule hours, event size, and the built-in Goals (labels, icons, colors, targets) to their original values. Your custom Goals, counts, and events will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        updateSettings({
                          themeColor: DEFAULT_THEME_COLOR,
                          secondaryColorLight: DEFAULT_SECONDARY_COLOR_LIGHT,
                          secondaryColorDark: DEFAULT_SECONDARY_COLOR_DARK,
                          tertiaryColorLight: DEFAULT_TERTIARY_COLOR_LIGHT,
                          tertiaryColorDark: DEFAULT_TERTIARY_COLOR_DARK,
                          defaultContactMethod: DEFAULT_CONTACT_METHOD,
                          eventTypeColors: {},
                          eventTypeDefaultMinutes: {},
                          gridStartHour: 6,
                          gridEndHour: 24,
                          eventSize: DEFAULT_EVENT_SIZE,
                        });
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
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
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
    durationBadge: {
      fontSize: 12,
      color: C.textLight,
      marginRight: 4,
    },
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
    // Everything that opens out of a row stays on the card's own surface — the
    // hairline rules and the indent separate it, not a change of background.
    expandedPanel: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    // Rounds off to match card's own corners. Needed explicitly because `card`
    // has no overflow: 'hidden' (see its own comment) — without it, this panel's
    // opaque background would square off what should be a rounded bottom edge.
    expandedPanelLast: {
      borderBottomWidth: 0,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
    },
    panelLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    // Undoes a colour choice only, so it reads as an action rather than taking
    // the red the destructive Data rows use.
    resetColorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'center',
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.control,
    },
    resetColorText: { fontSize: 13, fontWeight: '600', color: C.control },
    resetColorBtnDisabled: { borderColor: C.border },
    resetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
    },
    resetItemLabel: { flex: 1, fontSize: 15, color: C.text },
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
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
    },
    dropdownItemText: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    dropdownItemActive: {
      color: C.control,
      fontWeight: '600',
    },
    // Floating dropdowns — Schedule Hours, Event Size, Theme, Time Before, and
    // Default Contact Method. Detached from the row that opens it rather than
    // pushing the rows below down, the same construction as the pickers in
    // AddEditEventModal and AddEditPersonModal (see their `dropdownFloating` /
    // `pickerBackdrop`).
    //
    // fieldRow/fieldRowOpen mirror those screens' pickerRow/openPickerRow: a
    // trigger's wrapper needs a higher zIndex than the sibling row beneath it
    // in the same card, or the floating panel would paint behind it.
    fieldRow: { zIndex: 20 },
    fieldRowOpen: { zIndex: 30 },
    // Lifts the whole section above the ones that follow it in the ScrollView
    // — without this, a dropdown floating out of an earlier section would
    // still paint behind a later section's card, since siblings with equal
    // zIndex stack in document order.
    sectionFloating: { zIndex: 2 },
    floatingDropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      backgroundColor: C.card,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      overflow: 'hidden',
      shadowColor: C.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 12,
      zIndex: 21,
    },
    floatingDropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    floatingDropdownItemLast: {
      borderBottomWidth: 0,
    },
    floatingDropdownText: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    floatingDropdownTextActive: {
      color: C.control,
      fontWeight: '600',
    },
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
