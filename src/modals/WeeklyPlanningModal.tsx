import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { KIIcon } from '../components/KIIcon';

interface IconOption { name: string; family: string; }

const ICON_OPTIONS: IconOption[] = [
  { name: 'sunny',               family: 'Ionicons' },
  { name: 'moon',                family: 'Ionicons' },
  { name: 'book-outline',        family: 'Ionicons' },
  { name: 'heart',               family: 'Ionicons' },
  { name: 'star',                family: 'Ionicons' },
  { name: 'time-outline',        family: 'Ionicons' },
  { name: 'people',              family: 'Ionicons' },
  { name: 'person-outline',      family: 'Ionicons' },
  { name: 'home',                family: 'Ionicons' },
  { name: 'barbell-outline',     family: 'Ionicons' },
  { name: 'bicycle',             family: 'Ionicons' },
  { name: 'water',               family: 'Ionicons' },
  { name: 'leaf',                family: 'Ionicons' },
  { name: 'bulb-outline',        family: 'Ionicons' },
  { name: 'school',              family: 'Ionicons' },
  { name: 'trophy',              family: 'Ionicons' },
  { name: 'restaurant-outline',  family: 'Ionicons' },
  { name: 'musical-notes',       family: 'Ionicons' },
  { name: 'compass',             family: 'Ionicons' },
  { name: 'ribbon',              family: 'Ionicons' },
  { name: 'color-palette-outline', family: 'Ionicons' },
  { name: 'synagogue',           family: 'MaterialCommunityIcons' },
  { name: 'church',              family: 'MaterialCommunityIcons' },
  { name: 'hands-pray',         family: 'MaterialCommunityIcons' },
  { name: 'cross',               family: 'MaterialCommunityIcons' },
];

const COLOR_OPTIONS: string[] = [
  '#E74C3C', '#E05C6B', '#800000', '#D2691E', '#E8980E', '#E8B820', '#2ECC71', '#27AE60',
  '#1A3A6B', '#2979FF', '#00B5C8', '#A29BFE', '#9B59B6', '#795548', '#9E9E9E', '#4E342E',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: IndicatorDefinition[];
  onUpdateDefinitions: (defs: IndicatorDefinition[]) => Promise<void>;
}

export function WeeklyPlanningModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [localDefs, setLocalDefs] = useState<IndicatorDefinition[]>(definitions);
  const [newName, setNewName] = useState('');
  const [selectedIconOpt, setSelectedIconOpt] = useState<IconOption>(ICON_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setNewName('');
      setSelectedIconOpt(ICON_OPTIONS[0]);
      setSelectedColor(COLOR_OPTIONS[0]);
    }
  }, [visible]);

  function removeKI(id: string) {
    setLocalDefs(prev => prev.filter(d => d.id !== id));
  }

  function addKI() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newDef: IndicatorDefinition = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      icon: selectedIconOpt.name,
      iconFamily: selectedIconOpt.family,
      goal: 1,
      type: 'numeric',
      color: selectedColor,
      visible: true,
      builtIn: false,
    };
    setLocalDefs(prev => [...prev, newDef]);
    setNewName('');
    setSelectedIconOpt(ICON_OPTIONS[0]);
    setSelectedColor(COLOR_OPTIONS[0]);
  }

  async function handleSave() {
    await onUpdateDefinitions(localDefs);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <View style={{ width: 60 }} />
        <Text style={styles.headerTitle}>Edit KIs</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>KEY INDICATORS</Text>
        <View style={styles.kiList}>
          {localDefs.map((def, index) => (
            <View
              key={def.id}
              style={[styles.kiRow, index === localDefs.length - 1 && styles.kiRowLast]}
            >
              <View style={[styles.kiIcon, { backgroundColor: isDark ? def.color : def.color + '20' }]}>
                <KIIcon icon={def.icon} iconFamily={def.iconFamily} size={20} color={isDark ? lightenColor(def.color) : def.color} />
              </View>
              <Text style={styles.kiLabel} numberOfLines={1}>{def.label}</Text>
              {def.builtIn ? (
                <View style={styles.lockIcon}>
                  <Ionicons name="lock-closed-outline" size={16} color={Colors.textLight} />
                </View>
              ) : (
                <TouchableOpacity onPress={() => removeKI(def.id)} style={styles.deleteIcon}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>ADD KEY INDICATOR</Text>
        <View style={styles.addCard}>
          <TextInput
            style={styles.nameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Indicator name..."
            placeholderTextColor={Colors.textLight}
            returnKeyType="done"
          />

          <Text style={styles.pickerLabel}>Icon</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.iconScroll}
            contentContainerStyle={styles.iconScrollContent}
          >
            {ICON_OPTIONS.map(opt => {
              const isSelected = selectedIconOpt.name === opt.name && selectedIconOpt.family === opt.family;
              return (
                <TouchableOpacity
                  key={`${opt.family}:${opt.name}`}
                  onPress={() => setSelectedIconOpt(opt)}
                  style={[
                    styles.iconOption,
                    isSelected && { backgroundColor: selectedColor + '25', borderColor: selectedColor },
                  ]}
                >
                  <KIIcon
                    icon={opt.name}
                    iconFamily={opt.family}
                    size={22}
                    color={isSelected ? selectedColor : Colors.textSecondary}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.pickerLabel}>Color</Text>
          {[COLOR_OPTIONS.slice(0, 8), COLOR_OPTIONS.slice(8, 16)].map((row, ri) => (
            <View key={ri} style={styles.colorRow}>
              {row.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setSelectedColor(color)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorDotSelected,
                  ]}
                >
                  {selectedColor === color && (
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {newName.trim() ? (
            <View style={styles.previewRow}>
              <View style={[styles.kiIcon, { backgroundColor: isDark ? selectedColor : selectedColor + '20' }]}>
                <KIIcon icon={selectedIconOpt.name} iconFamily={selectedIconOpt.family} size={20} color={isDark ? lightenColor(selectedColor) : selectedColor} />
              </View>
              <Text style={[styles.previewLabel, { color: selectedColor }]}>{newName.trim()}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.addBtn, !newName.trim() && styles.addBtnDisabled]}
            onPress={addKI}
            disabled={!newName.trim()}
          >
            <Ionicons name="add" size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>Add Indicator</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.card,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: C.text,
    },
    closeBtn: {
      width: 60,
      alignItems: 'flex-end',
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      padding: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    kiList: {
      backgroundColor: C.card,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    kiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    kiRowLast: {
      borderBottomWidth: 0,
    },
    kiIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kiLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
    lockIcon: {
      width: 28,
      alignItems: 'center',
    },
    deleteIcon: {
      width: 28,
      alignItems: 'center',
    },
    addCard: {
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    nameInput: {
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    pickerLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      marginBottom: 8,
    },
    iconScroll: {
      marginBottom: 16,
    },
    iconScrollContent: {
      gap: 6,
    },
    iconOption: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    colorRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 6,
    },
    colorDot: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorDotSelected: {
      borderWidth: 2,
      borderColor: C.text,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: C.background,
      borderRadius: 8,
      marginBottom: 14,
    },
    previewLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.accent,
      borderRadius: 10,
      paddingVertical: 12,
    },
    addBtnDisabled: {
      opacity: 0.4,
    },
    addBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.white,
    },
    saveBtn: {
      backgroundColor: C.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: C.white,
      letterSpacing: 0.5,
    },
  });
}
