import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, TextInput, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels, EventTypeConfig, DEFAULT_THEME_COLOR } from '../constants/colors';
import { EventSizes, EVENT_SIZE_OPTIONS, DEFAULT_EVENT_SIZE, resolveEventSize } from '../constants/eventSizes';
import { GradientColorPicker } from '../components/GradientColorPicker';
import { DurationSlider, durationLabel } from '../components/DurationSlider';
import { useSettings } from '../hooks/useSettings';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { isCheckboxType, hasOptionalEnd } from '../utils/eventUtils';
import { useAuth } from '../lib/AuthContext';
import { drainThenClear } from '../lib/localData';
import { isAppDataKey } from '../constants/storageKeys';
import { pullAll } from '../lib/sync';
import { MAPS_APP_OPTIONS } from '../utils/mapUtils';
import { CONTACT_METHODS, DEFAULT_CONTACT_METHOD, DEFAULT_METHOD_CHOICES } from '../constants/contactMethods';
import { GoalIcon } from '../components/GoalIcon';

const START_HOUR_OPTIONS = [4, 5, 6, 7, 8, 9, 10];
const END_HOUR_OPTIONS = [21, 22, 23, 24];

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const EVENT_TYPES = Object.keys(EventColors);

export function SettingsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { settings, updateSettings } = useSettings();
  const { resetAll, resetBuiltInDefinitions } = useWeeklyGoals();
  const { deleteAllEvents } = useCalendarEvents();
  const { signOut, user } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [hourDropdown, setHourDropdown] = useState<'start' | 'end' | null>(null);
  const [methodDropdown, setMethodDropdown] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorResetOpen, setColorResetOpen] = useState(false);
  // The types deliberately spared, so everything listed starts checked.
  const [keptTypes, setKeptTypes] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  // Content-relative y of the country-code section, from its onLayout.
  const codeSectionY = useRef(0);

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

  async function handleResetLocal() {
    if (!user) return;
    setResetting(true);
    try {
      // Push first. Clearing with ops still queued would discard work that
      // exists nowhere else — and if the push failed we are almost certainly
      // offline, in which case the re-download would come back empty anyway.
      const { cleared, pending } = await drainThenClear();
      if (!cleared) {
        Alert.alert(
          'Nothing was cleared',
          `${pending} change${pending === 1 ? '' : 's'} still need${pending === 1 ? 's' : ''} to sync, so your data was left alone. Reconnect and try again.`,
        );
        return;
      }
      await pullAll(user.id);
    } catch (e) {
      Alert.alert('Re-download failed', 'Local data was cleared but the download failed. Check your connection and relaunch the app.');
      console.log('[reset] failed:', e);
    } finally {
      setResetting(false);
    }
  }

  async function handleExport() {
    try {
      // Allowlisted: a blanket dump includes the `sb-<ref>-auth-token` key,
      // which holds the access AND refresh tokens — anyone receiving the shared
      // file would own the account until the refresh token is revoked.
      const keys = (await AsyncStorage.getAllKeys()).filter(isAppDataKey);
      const pairs = await AsyncStorage.multiGet(keys as string[]);
      const data: Record<string, unknown> = {};
      pairs.forEach(([k, v]) => { if (v) data[k] = JSON.parse(v); });
      const json = JSON.stringify(data, null, 2);
      const path = (cacheDirectory ?? '') + 'rm-book-export.json';
      await writeAsStringAsync(path, json);
      await Sharing.shareAsync(path, { mimeType: 'application/json' });
    } catch {
      Alert.alert('Export failed', 'Could not export data.');
    }
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SCHEDULE HOURS</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => setHourDropdown(hourDropdown === 'start' ? null : 'start')}
            >
              <Text style={styles.rowLabel}>Start Time</Text>
              <Text style={styles.rowValue}>{hourLabel(settings.gridStartHour)}</Text>
              <Ionicons
                name={hourDropdown === 'start' ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
            {hourDropdown === 'start' && (
              <View style={styles.dropdownList}>
                {START_HOUR_OPTIONS.map((h, i) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.dropdownItem, i === START_HOUR_OPTIONS.length - 1 && styles.dropdownItemLast]}
                    onPress={() => { updateSettings({ gridStartHour: h }); setHourDropdown(null); }}
                  >
                    <Text style={[styles.dropdownItemText, settings.gridStartHour === h && styles.dropdownItemActive]}>
                      {hourLabel(h)}
                    </Text>
                    {settings.gridStartHour === h && (
                      <Ionicons name="checkmark" size={16} color={Colors.control} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.row, hourDropdown !== 'end' && styles.rowLast]}
              onPress={() => setHourDropdown(hourDropdown === 'end' ? null : 'end')}
            >
              <Text style={styles.rowLabel}>End Time</Text>
              <Text style={styles.rowValue}>{hourLabel(settings.gridEndHour)}</Text>
              <Ionicons
                name={hourDropdown === 'end' ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
            {hourDropdown === 'end' && (
              <View style={[styles.dropdownList, styles.dropdownListLast]}>
                {END_HOUR_OPTIONS.map((h, i) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.dropdownItem, i === END_HOUR_OPTIONS.length - 1 && styles.dropdownItemLast]}
                    onPress={() => { updateSettings({ gridEndHour: h }); setHourDropdown(null); }}
                  >
                    <Text style={[styles.dropdownItemText, settings.gridEndHour === h && styles.dropdownItemActive]}>
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

        {/* Event Size */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT SIZE</Text>
          <View style={styles.card}>
            {EVENT_SIZE_OPTIONS.map((size, i, arr) => (
              <TouchableOpacity
                key={size}
                style={[styles.row, i === arr.length - 1 && styles.rowLast]}
                onPress={() => updateSettings({ eventSize: size })}
              >
                <Text style={styles.rowLabel}>{EventSizes[size].label}</Text>
                {selectedEventSize === size && (
                  <Ionicons name="checkmark" size={18} color={Colors.control} />
                )}
              </TouchableOpacity>
            ))}
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

        {/* Default Contact Method. The section title names the setting, so the
            row carries the value alone rather than repeating it as a label. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEFAULT CONTACT METHOD</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, !methodDropdown && styles.rowLast]}
              onPress={() => setMethodDropdown(v => !v)}
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
                name={methodDropdown ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
              />
            </TouchableOpacity>
            {methodDropdown && (
              <View style={[styles.dropdownList, styles.dropdownListLast]}>
                {DEFAULT_METHOD_CHOICES.map((key, i, arr) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.dropdownItem, i === arr.length - 1 && styles.dropdownItemLast]}
                    onPress={() => { updateSettings({ defaultContactMethod: key }); setMethodDropdown(false); }}
                  >
                    <View style={styles.methodIcon}>
                      <GoalIcon
                        icon={CONTACT_METHODS[key].icon}
                        iconFamily={CONTACT_METHODS[key].iconFamily}
                        size={18}
                        color={selectedMethod === key ? Colors.control : Colors.textSecondary}
                      />
                    </View>
                    <Text style={[styles.dropdownItemText, selectedMethod === key && styles.dropdownItemActive]}>
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

        {/* Theme */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>THEME</Text>
          <View style={styles.card}>
            {(['light', 'dark', 'system'] as const).map((theme, i, arr) => (
              <TouchableOpacity
                key={theme}
                style={[styles.row, i === arr.length - 1 && styles.rowLast]}
                onPress={() => updateSettings({ theme })}
              >
                <Text style={styles.rowLabel}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</Text>
                {settings.theme === theme && (
                  <Ionicons name="checkmark" size={18} color={Colors.control} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App Color — `primary`, so this repaints every header, the active tab
            pill and the calendar's now-line in one go. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APP COLOR</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, !colorOpen && styles.rowLast]}
              onPress={() => setColorOpen(v => !v)}
            >
              <View style={[styles.colorDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.rowLabel}>App Color</Text>
              <Text style={styles.rowValue}>{Colors.primary}</Text>
              <Ionicons
                name={colorOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textLight}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
            {colorOpen && (
              <View style={[styles.expandedPanel, styles.expandedPanelLast]}>
                <GradientColorPicker
                  color={Colors.primary}
                  onChange={themeColor => updateSettings({ themeColor })}
                />
                <TouchableOpacity
                  style={styles.resetColorBtn}
                  onPress={() => updateSettings({ themeColor: DEFAULT_THEME_COLOR })}
                >
                  <Ionicons name="refresh" size={15} color={Colors.control} />
                  <Text style={styles.resetColorText}>Reset to Default Color</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Event Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT TYPES</Text>
          <View style={styles.card}>
            {EVENT_TYPES.map(type => {
              const isExpanded = expandedType === type;
              const mins = effectiveMinutes(type);
              const color = effectiveColor(type);
              return (
                <View key={type}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => setExpandedType(isExpanded ? null : type)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: color }]} />
                    <Text style={styles.rowLabel}>{EventTypeLabels[type]}</Text>
                    <Text style={styles.durationBadge}>
                      {mins !== null ? durationLabel(mins) : hasOptionalEnd(type) ? 'Optional' : 'Fixed'}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                      style={{ marginLeft: 4 }}
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
              style={[styles.row, !colorResetOpen && styles.rowLast]}
              disabled={customizedTypes.length === 0}
              onPress={() => { setColorResetOpen(v => !v); setKeptTypes([]); }}
            >
              <Text
                style={[
                  styles.rowLabel,
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
              <View style={[styles.expandedPanel, styles.expandedPanelLast]}>
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
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleExport}>
              <Text style={styles.rowLabel}>Export Data</Text>
              <Ionicons name="share-outline" size={18} color={Colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={handleResetWeek}>
              <Text style={[styles.rowLabel, { color: Colors.danger }]}>Reset Current Week</Text>
              <Ionicons name="refresh" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                Alert.alert(
                  'Reset Settings to Default',
                  'This will reset the app color, all event colors, default durations, the default contact method, schedule hours, event size, and the built-in Goals (labels, icons, colors, targets) to their original values. Your custom Goals, counts, and events will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        updateSettings({
                          themeColor: DEFAULT_THEME_COLOR,
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

        {/* Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYNC</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              disabled={resetting}
              onPress={() =>
                Alert.alert(
                  'Re-download From Server',
                  "Uploads anything still pending, then clears this device's copy and downloads everything again from your account.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Re-download', style: 'destructive', onPress: handleResetLocal },
                  ],
                  { cancelable: true }
                )
              }
            >
              <Text style={[styles.rowLabel, { color: resetting ? Colors.textLight : Colors.danger }]}>
                {resetting ? 'Re-downloading…' : 'Re-download From Server'}
              </Text>
              <Ionicons
                name="cloud-download-outline"
                size={18}
                color={resetting ? Colors.textLight : Colors.danger}
              />
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
    card: {
      backgroundColor: C.card,
      borderRadius: 12,
      overflow: 'hidden',
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
    // Everything that opens out of a row stays on the card's own surface — the
    // hairline rules and the indent separate it, not a change of background.
    expandedPanel: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    expandedPanelLast: {
      borderBottomWidth: 0,
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
    dropdownItemLast: {
      borderBottomWidth: 0,
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
