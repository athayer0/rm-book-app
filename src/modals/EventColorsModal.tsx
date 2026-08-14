import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { EventColors, EventTypeLabels } from '../constants/colors';
import { SheetModal } from '../components/SheetModal';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { eventTypeColor } from '../utils/eventUtils';
import { useSettings } from '../hooks/useSettings';

const EVENT_TYPES = Object.keys(EventColors);

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Every event type's colour on one screen. Split out of the old "Customize
 * Types" section, which expanded a colour picker and a duration slider under the
 * same row — two unrelated settings sharing a panel, and a picker that pushed
 * fourteen rows down the screen whenever it opened.
 */
export function EventColorsModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setEditing(null);
  }, [visible]);

  const colorOf = (type: string) => eventTypeColor(type, settings.eventTypeColors);

  function setColor(type: string, color: string) {
    updateSettings({ eventTypeColors: { ...settings.eventTypeColors, [type]: color } });
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Colors</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* No ScrollView: fifteen fixed rows, nothing expands, so the list is
          sized to fit. Editing happens on a sheet over the top.

          SheetModal runs to the bottom edge of the screen and adds no inset of
          its own, so without this the last row sits under the home indicator.
          Taking it off the list rather than off the sheet is also what leaves
          the gap below the card — and it costs nothing on a device with no
          indicator to clear, where the rows keep their full height. */}
      <View style={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.cardShadow}>
        <View style={styles.card}>
          {EVENT_TYPES.map((type, i, arr) => (
            <TouchableOpacity
              key={type}
              style={[styles.row, i === arr.length - 1 && styles.rowLast]}
              onPress={() => setEditing(type)}
              activeOpacity={0.7}
            >
              <View style={[styles.dot, { backgroundColor: colorOf(type) }]} />
              <Text style={styles.rowLabel}>{EventTypeLabels[type]}</Text>
              {/* Only a type actually off its stock colour says so — the badge is
                  there to find what you have changed, not to label the rest. */}
              {colorOf(type) !== EventColors[type] && <Text style={styles.customBadge}>Custom</Text>}
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
        </View>
      </View>

      <ColorPickerSheet
        visible={editing !== null}
        color={editing ? colorOf(editing) : EventColors.other}
        title={editing ? EventTypeLabels[editing] : undefined}
        defaultColor={editing ? EventColors[editing] : undefined}
        onCancel={() => setEditing(null)}
        onDone={hex => { if (editing) setColor(editing, hex); setEditing(null); }}
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
    // Shadow only — kept off `card` because overflow:'hidden' clips a shadow
    // along with everything else, which on iOS erases it outright.
    cardShadow: {
      flex: 1,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    card: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    // Rows share the card's height rather than each claiming a fixed padding.
    // Fifteen rows at a fixed height fit an iPhone 14 and overflow an SE by
    // ninety pixels; letting them flex means the list fits any screen exactly,
    // which is the whole point of there being no scroll view.
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
    dot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
    customBadge: { fontSize: 11, color: C.textLight, marginRight: 8 },
  });
}
