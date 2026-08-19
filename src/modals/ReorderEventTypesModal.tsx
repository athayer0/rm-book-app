import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture, ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { SheetModal } from '../components/SheetModal';
import { EventTypeDefinition } from '../constants/eventTypeDefaults';
import { useSettings } from '../hooks/useSettings';
import { eventTypeColor } from '../utils/eventUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitions: EventTypeDefinition[];
  onUpdateDefinitions: (defs: EventTypeDefinition[]) => Promise<void>;
}

/** Removes `id` and reinserts it at `toIndex`. Returns `arr` unchanged (same reference) if it's already there. */
function moveId(arr: string[], id: string, toIndex: number): string[] {
  const from = arr.indexOf(id);
  if (from === -1 || from === toIndex) return arr;
  const next = [...arr];
  next.splice(from, 1);
  next.splice(toIndex, 0, id);
  return next;
}

/**
 * The vertical, one-shared-order counterpart to the goal grid's 2-D drag —
 * every event type in one list, long-press-and-drag to set the order every
 * other vertical list of types (the type picker, quick-add, the Event Type
 * dropdown, ...) then reads, via useEventTypeDefinitions' central sort.
 *
 * Uses gesture-handler's own ScrollView rather than core RN's, so the list can
 * still scroll on a quick swipe while a long-press-then-drag reorders a row —
 * a plain RN ScrollView isn't part of the gesture-handler responder system and
 * would fight the pan gesture for the same touch.
 */
export function ReorderEventTypesModal({ visible, onClose, definitions, onUpdateDefinitions }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { settings } = useSettings();

  const baseOrder = useMemo(() => definitions.filter(d => !d.removed).map(d => d.id), [definitions]);
  const byId = useMemo(() => Object.fromEntries(definitions.map(d => [d.id, d])), [definitions]);

  const [order, setOrder] = useState<string[]>(baseOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const rowHeightRef = useRef(0);
  const startIndexRef = useRef(0);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setOrder(baseOrder);
      setDraggingId(null);
      setDragOffsetY(0);
    }
  }, [visible]);

  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > 0) rowHeightRef.current = height;
  }, []);

  const startDrag = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const idx = order.indexOf(id);
    startIndexRef.current = idx;
    currentIndexRef.current = idx;
    setDraggingId(id);
    setDragOffsetY(0);
  }, [order]);

  const updateDrag = useCallback((id: string, translationY: number) => {
    const rowHeight = rowHeightRef.current;
    if (rowHeight) {
      const rowDelta = Math.round(translationY / rowHeight);
      const newIndex = Math.min(order.length - 1, Math.max(0, startIndexRef.current + rowDelta));
      if (newIndex !== currentIndexRef.current) {
        currentIndexRef.current = newIndex;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrder(prev => moveId(prev, id, newIndex));
      }
      setDragOffsetY(translationY - (newIndex - startIndexRef.current) * rowHeight);
    }
  }, [order]);

  const endDrag = useCallback(() => {
    setDraggingId(null);
    setDragOffsetY(0);
  }, []);

  // Edits are committed when the sheet closes, same as EventTypesModal — there
  // is no separate Save, only Close.
  function handleClose() {
    onClose();
    if (order !== baseOrder) {
      const patched = definitions.map(d => {
        const idx = order.indexOf(d.id);
        return idx === -1 ? d : { ...d, order: idx };
      });
      onUpdateDefinitions(patched);
    }
  }

  return (
    <SheetModal visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reorder</Text>
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
          Hold and drag a type to change where it appears everywhere event types are listed.
        </Text>

        <View style={styles.list}>
          <View style={styles.listClip}>
            {order.map((id, i, arr) => {
              const def = byId[id];
              if (!def) return null;
              return (
                <ReorderRow
                  key={id}
                  def={def}
                  color={eventTypeColor(def.id, settings.eventTypeColors)}
                  isLast={i === arr.length - 1}
                  onLayout={handleRowLayout}
                  isDragging={draggingId === id}
                  dragOffsetY={draggingId === id ? dragOffsetY : 0}
                  onDragStart={() => startDrag(id)}
                  onDragUpdate={ty => updateDrag(id, ty)}
                  onDragEnd={endDrag}
                  Colors={Colors}
                  styles={styles}
                />
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SheetModal>
  );
}

interface RowProps {
  def: EventTypeDefinition;
  color: string;
  isLast: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  isDragging: boolean;
  dragOffsetY: number;
  onDragStart: () => void;
  onDragUpdate: (translationY: number) => void;
  onDragEnd: () => void;
  Colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}

function ReorderRow({
  def, color, isLast, onLayout, isDragging, dragOffsetY, onDragStart, onDragUpdate, onDragEnd, Colors, styles,
}: RowProps) {
  const isDraggingRef = useRef(false);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .runOnJS(true)
    .onStart(() => {
      isDraggingRef.current = true;
      onDragStart();
    })
    .onUpdate(e => { if (isDraggingRef.current) onDragUpdate(e.translationY); })
    .onEnd(() => { if (isDraggingRef.current) onDragEnd(); })
    .onFinalize((_e, success) => {
      if (!success && isDraggingRef.current) onDragEnd();
      isDraggingRef.current = false;
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.row,
          isLast && styles.rowLast,
          isDragging && [styles.rowDragging, { transform: [{ translateY: dragOffsetY }] }],
        ]}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.label} numberOfLines={1}>{def.label}</Text>
        <Ionicons name="reorder-three-outline" size={22} color={Colors.textLight} />
      </View>
    </GestureDetector>
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
      backgroundColor: C.card,
      gap: 10,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowDragging: {
      zIndex: 10,
      elevation: 10,
      opacity: 0.95,
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
