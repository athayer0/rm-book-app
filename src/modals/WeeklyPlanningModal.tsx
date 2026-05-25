import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { IndicatorDefinition } from '../constants/defaultIndicators';

const ICON_OPTIONS: string[] = [
  'sunny', 'moon', 'book-outline', 'heart', 'star', 'time-outline',
  'people', 'home', 'barbell-outline', 'bicycle', 'water', 'leaf',
  'bulb-outline', 'school', 'trophy', 'flame',
  'musical-notes', 'compass', 'ribbon', 'cafe-outline',
];

const COLOR_OPTIONS: string[] = [
  '#F39C12', '#9B59B6', '#00B5C8', '#27AE60',
  '#3498DB', '#E74C3C', '#E91E63', '#F0C040',
  '#8B1A4A', '#FF6B35',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: IndicatorDefinition[];
  onUpdateDefinitions: (defs: IndicatorDefinition[]) => Promise<void>;
}

export function WeeklyPlanningModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const [localDefs, setLocalDefs] = useState<IndicatorDefinition[]>(definitions);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState(1);
  const [selectedIcon, setSelectedIcon] = useState(ICON_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setNewName('');
      setNewGoal(1);
      setSelectedIcon(ICON_OPTIONS[0]);
      setSelectedColor(COLOR_OPTIONS[0]);
    }
  }, [visible]);

  function adjustGoal(id: string, delta: number) {
    setLocalDefs(prev =>
      prev.map(d => d.id === id ? { ...d, goal: Math.max(1, d.goal + delta) } : d),
    );
  }

  function removeKI(id: string) {
    setLocalDefs(prev => prev.filter(d => d.id !== id));
  }

  function addKI() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newDef: IndicatorDefinition = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      icon: selectedIcon,
      iconFamily: 'Ionicons',
      goal: newGoal,
      type: 'numeric',
      color: selectedColor,
      visible: true,
      builtIn: false,
    };
    setLocalDefs(prev => [...prev, newDef]);
    setNewName('');
    setNewGoal(1);
    setSelectedIcon(ICON_OPTIONS[0]);
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
        <Text style={styles.headerTitle}>Weekly Planning</Text>
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
        {/* Current KI list */}
        <Text style={styles.sectionLabel}>KEY INDICATORS</Text>
        <View style={styles.kiList}>
          {localDefs.map((def, index) => (
            <View
              key={def.id}
              style={[styles.kiRow, index === localDefs.length - 1 && styles.kiRowLast]}
            >
              <View style={[styles.kiIcon, { backgroundColor: def.color + '20' }]}>
                <Ionicons name={def.icon as any} size={20} color={def.color} />
              </View>
              <Text style={styles.kiLabel} numberOfLines={1}>{def.label}</Text>
              <View style={styles.goalStepper}>
                <TouchableOpacity
                  onPress={() => adjustGoal(def.id, -1)}
                  style={styles.stepBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="remove" size={14} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.goalNum}>{def.goal}</Text>
                <TouchableOpacity
                  onPress={() => adjustGoal(def.id, 1)}
                  style={styles.stepBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="add" size={14} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
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

        {/* Add new KI */}
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

          <View style={styles.addRow}>
            <Text style={styles.addRowLabel}>Weekly Goal</Text>
            <View style={styles.goalStepper}>
              <TouchableOpacity
                onPress={() => setNewGoal(g => Math.max(1, g - 1))}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="remove" size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.goalNum}>{newGoal}</Text>
              <TouchableOpacity
                onPress={() => setNewGoal(g => g + 1)}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="add" size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.pickerLabel}>Icon</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.iconScroll}
            contentContainerStyle={styles.iconScrollContent}
          >
            {ICON_OPTIONS.map(icon => (
              <TouchableOpacity
                key={icon}
                onPress={() => setSelectedIcon(icon)}
                style={[
                  styles.iconOption,
                  selectedIcon === icon && { backgroundColor: selectedColor + '25', borderColor: selectedColor },
                ]}
              >
                <Ionicons
                  name={icon as any}
                  size={22}
                  color={selectedIcon === icon ? selectedColor : Colors.textSecondary}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.pickerLabel}>Color</Text>
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map(color => (
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

          {/* Preview */}
          {newName.trim() ? (
            <View style={styles.previewRow}>
              <View style={[styles.kiIcon, { backgroundColor: selectedColor + '20' }]}>
                <Ionicons name={selectedIcon as any} size={20} color={selectedColor} />
              </View>
              <Text style={[styles.previewLabel, { color: selectedColor }]}>{newName.trim()}</Text>
              <Text style={styles.previewGoal}>Goal: {newGoal}</Text>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  closeBtn: {
    width: 60,
    alignItems: 'flex-end',
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textLight,
    letterSpacing: 1,
    marginBottom: 8,
  },
  kiList: {
    backgroundColor: Colors.card,
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
    borderBottomColor: Colors.border,
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
    color: Colors.text,
  },
  goalStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalNum: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 22,
    textAlign: 'center',
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
    backgroundColor: Colors.card,
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
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  addRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
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
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotSelected: {
    borderWidth: 2.5,
    borderColor: Colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderRadius: 8,
    marginBottom: 14,
  },
  previewLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  previewGoal: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },
});
