import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { SheetModal } from '../components/SheetModal';
import { StatusCheckbox } from '../components/StatusCheckbox';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { useSettings } from '../hooks/useSettings';
import { eventTypeColor } from '../utils/eventUtils';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';

const CHECKBOX_SIZE = 20;

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Which event types send a reminder notification. Checked = included; absence
 * from the stored exclusion list is what "included" means, so a type added
 * later (built-in or custom) starts out reminding same as everything else —
 * see AppSettings.eventReminderExcludedTypeIds.
 */
export function EventReminderTypesModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { definitions } = useEventTypeDefinitions();
  const { settings, updateSettings } = useSettings();

  const excluded = settings.eventReminderExcludedTypeIds;

  function toggle(id: string) {
    if (excluded.includes(id)) {
      updateSettings({ eventReminderExcludedTypeIds: excluded.filter(x => x !== id) });
    } else {
      updateSettings({ eventReminderExcludedTypeIds: [...excluded, id] });
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12 }}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('eventReminderTypes.title')}</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.hint}>{t('eventReminderTypes.hint')}</Text>

        <View style={styles.list}>
          <View style={styles.listClip}>
            {definitions.map((def, i, arr) => {
              const isSelected = !excluded.includes(def.id);
              return (
                <TouchableOpacity
                  key={def.id}
                  style={[styles.row, i === arr.length - 1 && styles.rowLast]}
                  onPress={() => toggle(def.id)}
                  hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                >
                  <View style={[styles.dot, { backgroundColor: eventTypeColor(def.id, settings.eventTypeColors) }]} />
                  <Text style={styles.label} numberOfLines={1}>{eventTypeDisplayLabel(def, t)}</Text>
                  <StatusCheckbox checked={isSelected} size={CHECKBOX_SIZE} color={Colors.control} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    closeBtn: { width: 48, alignItems: 'flex-start' },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    hint: {
      fontSize: 13,
      color: C.textSecondary,
      marginBottom: 14,
    },
    list: {
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    listClip: {
      backgroundColor: C.card,
      borderRadius: 20,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    dot: { width: 14, height: 14, borderRadius: 7 },
    label: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
  });
}
