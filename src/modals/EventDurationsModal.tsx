import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels, EventTypeConfig } from '../constants/colors';
import { SheetModal } from '../components/SheetModal';
import { durationLabel } from '../components/DurationSlider';
import { DurationSheet } from '../components/DurationSheet';
import { eventTypeDefaultMinutes, hasOptionalEnd } from '../utils/eventUtils';
import { useSettings } from '../hooks/useSettings';

const EVENT_TYPES = Object.keys(EventColors);

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * How long each type of event runs by default. The other half of the old
 * "Customize Types" section — durations had been sharing a panel with colours,
 * so finding one meant scrolling past the other.
 */
export function EventDurationsModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setEditing(null);
  }, [visible]);

  const minutesOf = (type: string) => eventTypeDefaultMinutes(type, settings.eventTypeDefaultMinutes);
  const stockOf = (type: string) => EventTypeConfig[type]?.defaultMinutes ?? 30;

  function setDuration(type: string, minutes: number) {
    updateSettings({ eventTypeDefaultMinutes: { ...settings.eventTypeDefaultMinutes, [type]: minutes } });
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Default Durations</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* No ScrollView: the list is fifteen fixed rows and nothing expands, so
          it is sized to fit. Editing happens on a sheet over the top.

          The bottom inset is added here rather than in SheetModal — see the
          matching note in EventColorsModal for why it is what leaves the gap
          under the card. */}
      <View style={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.card}>
          {EVENT_TYPES.map((type, i, arr) => {
            const mins = minutesOf(type);
            return (
              <TouchableOpacity
                key={type}
                style={[styles.row, i === arr.length - 1 && styles.rowLast]}
                // A type with no duration to set has nothing to open. It stays on
                // the list all the same — "Contact is optional" is the answer
                // someone came here looking for.
                disabled={mins === null}
                onPress={() => setEditing(type)}
                activeOpacity={0.7}
              >
                <View style={[styles.dot, { backgroundColor: EventColors[type] }]} />
                <Text style={[styles.rowLabel, mins === null && styles.rowLabelMuted]}>
                  {EventTypeLabels[type]}
                </Text>
                <Text style={styles.rowValue}>
                  {mins !== null ? durationLabel(mins) : hasOptionalEnd(type) ? 'Optional' : 'Fixed'}
                </Text>
                {mins !== null && (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.textLight}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <DurationSheet
        visible={editing !== null}
        minutes={(editing && minutesOf(editing)) || 30}
        title={editing ? EventTypeLabels[editing] : undefined}
        defaultMinutes={editing ? stockOf(editing) : undefined}
        onCancel={() => setEditing(null)}
        onDone={d => { if (editing) setDuration(editing, d); setEditing(null); }}
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
    // Less above the card than beside it: the sheet header already provides
    // separation, so a full 16 there read as a gap rather than a margin.
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, backgroundColor: C.background },
    card: { flex: 1, backgroundColor: C.card, borderRadius: 12, overflow: 'hidden' },
    // Rows share the card's height — see the matching note in EventColorsModal
    // for why a fixed row height cannot fit both an iPhone 14 and an SE.
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, fontSize: 15, color: C.text },
    // A type that can't be edited here reads as inactive rather than looking
    // tappable and doing nothing.
    rowLabelMuted: { color: C.textSecondary },
    rowValue: { fontSize: 14, color: C.textSecondary },
    dot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  });
}
