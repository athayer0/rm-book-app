import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { DropdownMenu, DropdownItem } from '../components/DropdownMenu';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';
import { eventTypeColor } from '../utils/eventUtils';
import { useSettings } from '../hooks/useSettings';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { eventTypeDisplayLabel } from '../constants/eventTypeDefaults';

// Matches DropdownMenu's own open/close timing so the backdrop and the card it
// frames finish their animations together rather than one lagging the other.
const OPEN_MS = 190;
const CLOSE_MS = 130;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

interface Props {
  visible: boolean;
  onSelect: (type: string) => void;
  onClose: () => void;
}

/**
 * The intermediary step between tapping an empty calendar slot and the create
 * form: a small popup listing every event type, over a dimmed backdrop. Picking
 * one closes this and hands the type straight to AddEditEventModal's prefill —
 * there is no Cancel/Done pair, since tapping a row *is* the decision and
 * tapping the backdrop is the only way out.
 *
 * Deliberately **not** built on RN's `Modal`: AddEditEventModal opens the
 * instant a row is picked, in the same tick this closes, and two native Modals
 * transitioning in opposite directions at once is what used to hang the whole
 * screen — the outgoing one kept eating touches after the incoming one had
 * already taken over visually. Rendered in-tree instead, the same way the
 * month picker on this screen already floats over everything without one.
 */
export function EventTypeSheet({ visible, onSelect, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { definitions } = useEventTypeDefinitions();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const typeScrollEdges = useScrollEdges();

  // All fifteen rows fit on screen with room to spare on any phone in normal
  // use — this is a ceiling for small devices or a stretched font size, not the
  // size the list is designed to hit. Scrolling only kicks in past it.
  // TAB_BAR_HEIGHT comes off twice: once because this screen's own box already
  // stops above the bar, and again because centering within that box is padded
  // by the same amount to land on the true screen centre (see `center` below).
  const listMaxHeight = Math.max(200, windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - 160);

  // Kept mounted through the close animation, same trick as SheetModal and
  // DropdownMenu — a bare `visible && <View>` would cut the fade off mid-frame.
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(backdropOpacity, {
        toValue: 1, duration: OPEN_MS, easing: EASE_OUT, useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(backdropOpacity, {
        toValue: 0, duration: CLOSE_MS, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={[styles.center, { paddingTop: TAB_BAR_HEIGHT }]} pointerEvents="box-none">
        <Pressable style={styles.cardOuter} onPress={() => {}}>
          <DropdownMenu open={visible} variant="inline">
            <Text style={styles.title}>{t('addEditEvent.newEventTitle')}</Text>
            {/* Sized to show all fifteen types at once on any normal phone —
                this is meant to be glanced at and tapped, not scrolled through.
                The ScrollView is only a ceiling for the rare device too short
                for that, so the fades below only ever show on that device. */}
            <View>
              <ScrollView
                style={{ maxHeight: listMaxHeight }}
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                {...typeScrollEdges.scrollViewProps}
              >
                {definitions.map((def, i) => (
                  <DropdownItem
                    key={def.id}
                    label={eventTypeDisplayLabel(def, t)}
                    showSeparator={i < definitions.length - 1}
                    leading={<View style={[styles.dot, { backgroundColor: eventTypeColor(def.id, settings.eventTypeColors) }]} />}
                    onPress={() => onSelect(def.id)}
                  />
                ))}
              </ScrollView>
              {/* menuSurface, not card — this popup floats above the calendar,
                  not on a card, so fading to `card` would leave a visible band. */}
              <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={typeScrollEdges.showTopFade} />
              <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={typeScrollEdges.showBottomFade} />
            </View>
          </DropdownMenu>
        </Pressable>
      </View>
    </>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.modalBackdrop, zIndex: 200 },
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      zIndex: 201,
    },
    cardOuter: { width: '100%', maxWidth: 340 },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: C.text,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 8,
    },
    dot: { width: 16, height: 16, borderRadius: 8, marginRight: 12 },
  });
}
