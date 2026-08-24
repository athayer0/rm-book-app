import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { SheetModal } from '../components/SheetModal';
import { BottomSheet } from '../components/BottomSheet';
import { StatusCheckbox } from '../components/StatusCheckbox';
import { IconPicker, DEFAULT_ICON } from '../components/IconPicker';
import { GoalIcon } from '../components/GoalIcon';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { useSettings } from '../hooks/useSettings';
import { eventTypeColor } from '../utils/eventUtils';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';

export const MAX_QUICK_ADD_TYPES = 8;
// Room for IconPicker's full grid — a wrapping page of every icon on offer,
// not the one-row strip this sheet used to hold.
const ICON_SHEET_HEIGHT = 420;
const CHECKBOX_SIZE = 20;

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Which event types show as quick-add bubbles on the calendar's +, and which
 * icon distinguishes each one there — the only place an event type's icon is
 * ever shown, now that Event Types itself has no Icon field.
 */
export function QuickAddTypesModal({ visible, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { definitions } = useEventTypeDefinitions();
  const { settings, updateSettings } = useSettings();

  const [editingId, setEditingId] = useState<string | null>(null);

  const selected = settings.quickAddTypes;
  const atLimit = selected.length >= MAX_QUICK_ADD_TYPES;

  function toggle(id: string) {
    const existing = selected.find(q => q.id === id);
    if (existing) {
      updateSettings({ quickAddTypes: selected.filter(q => q.id !== id) });
      return;
    }
    if (atLimit) return;
    updateSettings({
      quickAddTypes: [...selected, { id, icon: DEFAULT_ICON.name, iconFamily: DEFAULT_ICON.family }],
    });
  }

  function setIcon(id: string, opt: { name: string; family: string }) {
    updateSettings({
      quickAddTypes: selected.map(q => (q.id === id ? { ...q, icon: opt.name, iconFamily: opt.family } : q)),
    });
  }

  const editingEntry = editingId ? selected.find(q => q.id === editingId) : undefined;
  const editingDef = editingId ? definitions.find(d => d.id === editingId) : undefined;
  const editingLabel = editingDef ? eventTypeDisplayLabel(editingDef, t) : '';

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12 }}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('quickAddTypes.title')}</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.hint}>
          {atLimit
            ? t('quickAddTypes.maxReached', { max: MAX_QUICK_ADD_TYPES })
            : t('quickAddTypes.chooseUpTo', { max: MAX_QUICK_ADD_TYPES })}
        </Text>

        <View style={styles.list}>
        <View style={styles.listClip}>
          {definitions.map((def, i, arr) => {
            const entry = selected.find(q => q.id === def.id);
            const isSelected = !!entry;
            const disabled = !isSelected && atLimit;
            return (
              <View
                key={def.id}
                style={[styles.row, i === arr.length - 1 && styles.rowLast]}
              >
                <View style={[styles.dot, { backgroundColor: eventTypeColor(def.id, settings.eventTypeColors) }]} />
                <Text
                  style={[styles.label, disabled && styles.labelMuted]}
                  numberOfLines={1}
                >
                  {eventTypeDisplayLabel(def, t)}
                </Text>
                {isSelected && (
                  <TouchableOpacity
                    style={styles.iconTrigger}
                    onPress={() => setEditingId(def.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <GoalIcon icon={entry.icon} iconFamily={entry.iconFamily} size={18} color={Colors.textSecondary} />
                    <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.checkArea}
                  onPress={() => toggle(def.id)}
                  disabled={disabled}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <StatusCheckbox
                    checked={isSelected}
                    size={CHECKBOX_SIZE}
                    color={disabled ? Colors.border : Colors.control}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <BottomSheet
        visible={editingId !== null}
        title={editingLabel}
        height={ICON_SHEET_HEIGHT}
        onCancel={() => setEditingId(null)}
        onDone={() => setEditingId(null)}
      >
        <ScrollView contentContainerStyle={styles.iconSheetContent} bounces={false}>
          {editingEntry && (
            <IconPicker
              icon={editingEntry.icon}
              iconFamily={editingEntry.iconFamily ?? 'Ionicons'}
              color={Colors.control}
              // Stays open on a tap — see IconPicker's own comment on why.
              onSelect={opt => setIcon(editingId!, opt)}
            />
          )}
        </ScrollView>
      </BottomSheet>
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
    checkArea: {
      width: CHECKBOX_SIZE,
      alignItems: 'center',
    },
    dot: { width: 14, height: 14, borderRadius: 7 },
    label: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
    labelMuted: {
      color: C.textLight,
    },
    iconTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconSheetContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
  });
}
