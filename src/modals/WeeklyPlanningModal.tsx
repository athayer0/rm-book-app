import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { SwatchColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { GoalDefinition } from '../constants/defaultGoals';
import { GoalIcon } from '../components/GoalIcon';
import { IconPicker, ICON_OPTIONS, IconOption } from '../components/IconPicker';
import { SheetModal } from '../components/SheetModal';

const COLOR_OPTIONS = SwatchColors;

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: GoalDefinition[];
  onUpdateDefinitions: (defs: GoalDefinition[]) => Promise<void>;
}

export function WeeklyPlanningModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [localDefs, setLocalDefs] = useState<GoalDefinition[]>(definitions);
  const [newName, setNewName] = useState('');
  const [selectedIconOpt, setSelectedIconOpt] = useState<IconOption>(ICON_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // The add card is the last thing in the list, so scrolling to the end brings all of
  // it above the keyboard.
  function revealAddCard() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  useEffect(() => {
    if (visible) {
      setLocalDefs(definitions);
      setNewName('');
      setSelectedIconOpt(ICON_OPTIONS[0]);
      setSelectedColor(COLOR_OPTIONS[0]);
      setExpandedId(null);
      setAddOpen(false);
    }
  }, [visible]);

  // Edits are committed when the sheet closes — including an iOS swipe-down dismiss,
  // which fires onRequestClose for a pageSheet.
  async function handleClose() {
    await onUpdateDefinitions(localDefs);
    onClose();
  }

  function removeGoal(id: string) {
    setLocalDefs(prev => prev.filter(d => d.id !== id));
    setExpandedId(null);
  }

  function patchGoal(id: string, patch: Partial<GoalDefinition>) {
    setLocalDefs(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addGoal() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newDef: GoalDefinition = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      icon: selectedIconOpt.name,
      iconFamily: selectedIconOpt.family,
      color: selectedColor,
      visible: true,
      builtIn: false,
    };
    setLocalDefs(prev => [...prev, newDef]);
    setNewName('');
    setSelectedIconOpt(ICON_OPTIONS[0]);
    setSelectedColor(COLOR_OPTIONS[0]);
    setAddOpen(false);
  }

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Goals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.sectionLabel}>GOALS</Text>
        <View style={styles.goalList}>
          {localDefs.map((def, index) => {
            const isExpanded = expandedId === def.id;
            const isLast = index === localDefs.length - 1;
            return (
              <View key={def.id}>
                <TouchableOpacity
                  style={[styles.goalRow, isLast && !isExpanded && styles.goalRowLast]}
                  onPress={() => setExpandedId(isExpanded ? null : def.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.goalIcon, { backgroundColor: isDark ? def.color : def.color + '20' }, !def.visible && styles.hiddenDim]}>
                    <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={20} color={isDark ? lightenColor(def.color) : def.color} />
                  </View>
                  <Text style={[styles.goalLabel, !def.visible && styles.hiddenDim]} numberOfLines={1}>
                    {def.label}
                  </Text>

                  {/* Built-ins hide rather than delete, keeping their counts and calendar
                      wiring intact. Custom goals have nothing to preserve, so they delete. */}
                  {def.builtIn ? (
                    <TouchableOpacity
                      onPress={() => patchGoal(def.id, { visible: !def.visible })}
                      style={styles.rowAction}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={def.visible ? 'eye-outline' : 'eye-off-outline'}
                        size={18}
                        color={def.visible ? Colors.textSecondary : Colors.textLight}
                      />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => removeGoal(def.id)}
                      style={styles.rowAction}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  )}

                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textLight}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[styles.editPanel, isLast && styles.editPanelLast]}>
                    {/* Default goals keep their names; only their look is editable. */}
                    {!def.builtIn && (
                      <>
                        <Text style={styles.pickerLabel}>Name</Text>
                        <TextInput
                          style={styles.nameInput}
                          value={def.label}
                          onChangeText={text => patchGoal(def.id, { label: text })}
                          placeholder="Goal name..."
                          placeholderTextColor={Colors.textLight}
                          returnKeyType="done"
                        />
                      </>
                    )}

                    <Text style={styles.pickerLabel}>Icon</Text>
                    <IconPicker
                      icon={def.icon}
                      iconFamily={def.iconFamily}
                      color={def.color}
                      onSelect={opt => patchGoal(def.id, { icon: opt.name, iconFamily: opt.family })}
                    />

                    <Text style={styles.pickerLabel}>Color</Text>
                    {[COLOR_OPTIONS.slice(0, 8), COLOR_OPTIONS.slice(8, 16)].map((row, ri) => (
                      <View key={ri} style={styles.colorRow}>
                        {row.map(color => (
                          <TouchableOpacity
                            key={color}
                            onPress={() => patchGoal(def.id, { color })}
                            style={[
                              styles.colorDot,
                              { backgroundColor: color },
                              def.color === color && styles.colorDotSelected,
                            ]}
                          >
                            {def.color === color && (
                              <Ionicons name="checkmark" size={13} color="#fff" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Doubles as the section header once open, so it can collapse the form again. */}
        <TouchableOpacity
          onPress={() => { setAddOpen(o => !o); if (!addOpen) revealAddCard(); }}
          style={styles.addLink}
        >
          <Ionicons
            name={addOpen ? 'close' : 'add'}
            size={18}
            color={Colors.goalTextAction}
          />
          <Text style={styles.addLinkText}>Add a Goal</Text>
        </TouchableOpacity>

        {addOpen && <>
        <View style={styles.addCard}>
          <TextInput
            style={styles.nameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Goal name..."
            placeholderTextColor={Colors.textLight}
            returnKeyType="done"
            onFocus={revealAddCard}
          />

          <Text style={styles.pickerLabel}>Icon</Text>
          <IconPicker
            icon={selectedIconOpt.name}
            iconFamily={selectedIconOpt.family}
            color={selectedColor}
            onSelect={setSelectedIconOpt}
          />

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

          <TouchableOpacity
            style={[styles.addBtn, !newName.trim() && styles.addBtnDisabled]}
            onPress={addGoal}
            disabled={!newName.trim()}
          >
            <Ionicons name="add" size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>Add Goal</Text>
          </TouchableOpacity>
        </View>
        </>}

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
      alignItems: 'flex-start',
    },
    flex: {
      flex: 1,
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
    goalList: {
      backgroundColor: C.card,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 10,
    },
    goalRowLast: {
      borderBottomWidth: 0,
    },
    goalIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: C.text,
    },
    rowAction: {
      width: 28,
      alignItems: 'center',
    },
    // Mirrors addBtn's layout and type, minus the fill.
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20,
      paddingVertical: 10,
    },
    addLinkText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.goalTextAction,
    },
    hiddenDim: {
      opacity: 0.4,
    },
    // Matches the add card: white panel with the same 16pt padding, so the
    // C.background icon squares read against it and line up identically.
    editPanel: {
      padding: 16,
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    editPanelLast: {
      borderBottomWidth: 0,
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
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.goalActionBg,
      borderRadius: 10,
      paddingVertical: 12,
      marginTop: 14,
    },
    addBtnDisabled: {
      opacity: 0.4,
    },
    addBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.white,
    },
  });
}
