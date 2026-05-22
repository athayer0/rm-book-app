import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, EventColors, EventTypeLabels, EventTypeConfig } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useAuth } from '../lib/AuthContext';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
// 4 AM (4) through 10 AM (10)
const START_HOUR_OPTIONS = [4, 5, 6, 7, 8, 9, 10];
// 9 PM (21) through midnight (24)
const END_HOUR_OPTIONS = [21, 22, 23, 24];

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const COLOR_SWATCHES = [
  '#E05C6B', '#E74C3C', '#800000', '#D2691E', '#F39C12',
  '#F4D03F', '#2ECC71', '#27AE60', '#1A3A6B', '#2979FF',
  '#00B5C8', '#9B59B6', '#A29BFE', '#795548', '#9E9E9E', '#4E342E',
];

const EVENT_TYPES = Object.keys(EventColors);

export function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { resetAll } = useWeeklyIndicators();
  const { deleteAllEvents } = useCalendarEvents();
  const { signOut } = useAuth();
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [hourDropdown, setHourDropdown] = useState<'start' | 'end' | null>(null);

  async function handleExport() {
    try {
      const keys = await AsyncStorage.getAllKeys();
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
    Alert.alert('Reset Week', 'This will clear all indicator counts for the current week. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAll },
    ]);
  }

  function effectiveColor(type: string) {
    return settings.eventTypeColors[type] ?? EventColors[type];
  }

  function effectiveMinutes(type: string): number | null {
    if (EventTypeConfig[type]?.defaultMinutes === 0) return null;
    return settings.eventTypeDefaultMinutes[type] ?? EventTypeConfig[type]?.defaultMinutes ?? 30;
  }

  function setColor(type: string, color: string) {
    updateSettings({ eventTypeColors: { ...settings.eventTypeColors, [type]: color } });
  }

  function setDuration(type: string, minutes: number) {
    updateSettings({ eventTypeDefaultMinutes: { ...settings.eventTypeDefaultMinutes, [type]: minutes } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
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
                  <Ionicons name="checkmark" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Schedule Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SCHEDULE HOURS</Text>
          <View style={styles.card}>
            {/* Start hour */}
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
                      <Ionicons name="checkmark" size={16} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* End hour */}
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
                      <Ionicons name="checkmark" size={16} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Daily Reminder</Text>
              <Switch
                value={settings.reminderEnabled}
                onValueChange={v => updateSettings({ reminderEnabled: v })}
                trackColor={{ true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
            {settings.reminderEnabled && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Reminder Time</Text>
                <Text style={styles.rowValue}>{settings.reminderTime}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>THEME</Text>
          <View style={styles.card}>
            {(['light', 'dark', 'system'] as const).map(theme => (
              <TouchableOpacity
                key={theme}
                style={styles.row}
                onPress={() => updateSettings({ theme })}
              >
                <Text style={styles.rowLabel}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</Text>
                {settings.theme === theme && (
                  <Ionicons name="checkmark" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Event Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EVENT TYPES</Text>
          <View style={styles.card}>
            {EVENT_TYPES.map((type, i) => {
              const isLast = i === EVENT_TYPES.length - 1;
              const isExpanded = expandedType === type;
              const mins = effectiveMinutes(type);
              const color = effectiveColor(type);
              return (
                <View key={type}>
                  <TouchableOpacity
                    style={[styles.row, isLast && !isExpanded && styles.rowLast]}
                    onPress={() => setExpandedType(isExpanded ? null : type)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: color }]} />
                    <Text style={styles.rowLabel}>{EventTypeLabels[type]}</Text>
                    <Text style={styles.durationBadge}>
                      {mins === null ? 'Fixed' : `${mins} min`}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textLight}
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={[styles.expandedPanel, isLast && styles.expandedPanelLast]}>
                      {/* Color swatches */}
                      <Text style={styles.panelLabel}>Color</Text>
                      <View style={styles.swatchGrid}>
                        {COLOR_SWATCHES.map(swatch => (
                          <TouchableOpacity
                            key={swatch}
                            style={[
                              styles.swatch,
                              { backgroundColor: swatch },
                              color === swatch && styles.swatchSelected,
                            ]}
                            onPress={() => setColor(type, swatch)}
                          />
                        ))}
                      </View>

                      {/* Duration pills */}
                      {mins !== null ? (
                        <>
                          <Text style={[styles.panelLabel, { marginTop: 12 }]}>Default Duration</Text>
                          <View style={styles.pillRow}>
                            {DURATION_OPTIONS.map(d => (
                              <TouchableOpacity
                                key={d}
                                style={[styles.pill, mins === d && styles.pillActive]}
                                onPress={() => setDuration(type, d)}
                              >
                                <Text style={[styles.pillText, mins === d && styles.pillTextActive]}>
                                  {d < 60 ? `${d}m` : `${d / 60}h`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.fixedLabel}>Fixed – 15 min block</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
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
                  'This will reset all event colors, default durations, and schedule hours to their original values. Your events will not be affected.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => updateSettings({
                        eventTypeColors: {},
                        eventTypeDefaultMinutes: {},
                        gridStartHour: 6,
                        gridEndHour: 24,
                      }),
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
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },
  scroll: { flex: 1, backgroundColor: Colors.background },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textLight,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.card,
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
    borderBottomColor: Colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.text },
  rowValue: { fontSize: 14, color: Colors.textSecondary },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  durationBadge: {
    fontSize: 12,
    color: Colors.textLight,
    marginRight: 4,
  },
  expandedPanel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  expandedPanelLast: {
    borderBottomWidth: 0,
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: Colors.text,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '20',
  },
  pillText: { fontSize: 13, color: Colors.textSecondary },
  pillTextActive: { color: Colors.accent, fontWeight: '600' },
  dropdownList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
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
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  dropdownItemActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  fixedLabel: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  scriptureRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 0,
  },
  scripture: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  scriptureRef: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});
