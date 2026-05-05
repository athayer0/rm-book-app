import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';

export function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { resetAll } = useWeeklyIndicators();

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
    } catch (e) {
      Alert.alert('Export failed', 'Could not export data.');
    }
  }

  function handleResetWeek() {
    Alert.alert('Reset Week', 'This will clear all indicator counts for the current week. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAll },
    ]);
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

        {/* Actions */}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: 14,
    color: Colors.textSecondary,
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
