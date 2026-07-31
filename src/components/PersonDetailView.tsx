import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { PERSON_STATUSES, statusDisplayName } from '../constants/personStatuses';
import { StatusIcon } from './StatusIcon';
import { ScrollableValue } from './ScrollableValue';
import { AppSettings } from '../hooks/useSettings';
import {
  callNumber, messageNumber, openMessenger, openWhatsApp,
  toDialable, toMessengerHandle,
} from '../utils/phoneUtils';
import { openMaps, toMapQuery } from '../utils/mapUtils';

interface Props {
  /**
   * The fields as they stand, handed over individually rather than as a Person:
   * they come from the editor's own form state, so returning here after Save
   * reads back what was just written. The screens hold a snapshot of the person
   * that doesn't refresh, and a half-built Person object would invite reading
   * `id` off it.
   */
  name: string;
  status: string;
  phone: string;
  whatsapp: string | null;
  messenger: string | null;
  address: string | null;
  notes: string;
  starred: boolean;
  settings: AppSettings;
  /** Notes the attempt against this person, then hands off to the other app. */
  onContact: (method: string, open: () => void) => void;
}

/**
 * A person as they stand, with nothing offering to be typed in.
 *
 * The same uppercase labels as the editor, minus every affordance: no rules under
 * the values, no chevron on the status, no × on a contact method. Unlike the
 * editor, which gives each field a card of its own, everything here — including
 * their name — shares one card and is separated by rules, reading as a page
 * about the person rather than a stack of things to fill in.
 *
 * What stays live are the actions — call, text, WhatsApp, Messenger, Maps — since
 * those do something to the world rather than edit the record. The star is shown
 * only when set, and only as a mark; toggling it is an edit.
 *
 * Empty fields are dropped rather than shown blank, so what's here is what the
 * person actually has.
 */
export function PersonDetailView({
  name, status, phone, whatsapp, messenger, address, notes, starred, settings, onContact,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const trimmedName = name.trim();
  const dialable = toDialable(phone);
  const whatsappDialable = toDialable(whatsapp);
  const messengerHandle = toMessengerHandle(messenger);
  const mapQuery = toMapQuery(address);

  const phoneText = phone.trim();
  const whatsappText = whatsapp?.trim() ?? '';
  const messengerText = messenger?.trim() ?? '';
  const addressText = address?.trim() ?? '';
  const notesText = notes.trim();

  /**
   * The card's contents, gathered rather than written inline so the rules
   * between them fall where they should. Which groups are present varies by
   * person, and a divider drawn by each group itself would land above the first
   * one or below the last as soon as a neighbour dropped out.
   */
  const groups: { key: string; node: React.ReactNode }[] = [];

  groups.push({
    key: 'status',
    node: (
      <>
        <Text style={styles.label}>Status</Text>
        <View style={styles.inlineValue}>
          {PERSON_STATUSES[status] && <StatusIcon config={PERSON_STATUSES[status]} size={14} />}
          <Text style={styles.value}>{statusDisplayName(status)}</Text>
        </View>
      </>
    ),
  });

  if (phoneText.length > 0) {
    groups.push({
      key: 'phone',
      node: (
        <>
          <Text style={styles.label}>Phone</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{phoneText}</Text>
            {dialable.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => onContact('text', () => messageNumber(phone))}
                  accessibilityRole="button"
                  accessibilityLabel={trimmedName ? `Message ${trimmedName}` : 'Message this number'}
                >
                  <Ionicons name="chatbubble" size={17} color={Colors.control} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => onContact('phone', () => callNumber(phone))}
                  accessibilityRole="button"
                  accessibilityLabel={trimmedName ? `Call ${trimmedName}` : 'Call this number'}
                >
                  <Ionicons name="call" size={18} color={Colors.control} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      ),
    });
  }

  if (whatsappText.length > 0) {
    groups.push({
      key: 'whatsapp',
      node: (
        <>
          <Text style={styles.label}>WhatsApp</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{whatsappText}</Text>
            {whatsappDialable.length > 0 && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => onContact('whatsapp', () => openWhatsApp(whatsapp, settings.defaultCountryCode))}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? `WhatsApp ${trimmedName}` : 'Open in WhatsApp'}
              >
                <MaterialCommunityIcons name="whatsapp" size={20} color={Colors.control} />
              </TouchableOpacity>
            )}
          </View>
        </>
      ),
    });
  }

  if (messengerText.length > 0) {
    groups.push({
      key: 'messenger',
      node: (
        <>
          <Text style={styles.label}>Messenger</Text>
          <View style={styles.fieldRow}>
            {/* Shown whole and dragged through rather than truncated. It is
                usually a profile URL, where the tail is the part that names the
                person — an ellipsis would eat exactly what identifies them. */}
            <ScrollableValue
              value={messengerText}
              textStyle={styles.value}
              style={styles.fieldValue}
              fadeColor={Colors.card}
            />
            {messengerHandle.length > 0 && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => onContact('messenger', () => openMessenger(messenger))}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? `Message ${trimmedName} on Messenger` : 'Open in Messenger'}
              >
                <MaterialCommunityIcons name="facebook-messenger" size={20} color={Colors.control} />
              </TouchableOpacity>
            )}
          </View>
        </>
      ),
    });
  }

  if (addressText.length > 0) {
    groups.push({
      key: 'address',
      node: (
        <>
          <Text style={styles.label}>Address</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{addressText}</Text>
            {/* Not routed through onContact: looking up where someone lives isn't
                a contact, and often isn't even a visit. */}
            {mapQuery.length > 0 && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => openMaps(address, settings.mapsApp)}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? `Open ${trimmedName}’s address in Maps` : 'Open this address in Maps'}
              >
                <MaterialCommunityIcons name="map-marker" size={20} color={Colors.control} />
              </TouchableOpacity>
            )}
          </View>
        </>
      ),
    });
  }

  if (notesText.length > 0) {
    groups.push({
      key: 'notes',
      node: (
        <>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.value}>{notesText}</Text>
        </>
      ),
    });
  }

  return (
    <ScrollView style={styles.scroll} bounces={false} overScrollMode="never">
      <View style={styles.card}>
        <View style={styles.hero}>
          <Text style={styles.heroName}>{trimmedName || 'Unnamed'}</Text>
          {starred && (
            <Ionicons name="star" size={22} color={Colors.favorite} accessibilityLabel="Favorite" />
          )}
        </View>
        {groups.map((group) => (
          <View key={group.key} style={[styles.group, styles.groupDivided]}>
            {group.node}
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.background },
    // The card's own first row rather than a group, so the name can run larger
    // and centered while still sharing the card's rounded corners and background.
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      paddingTop: 16,
      paddingBottom: 14,
    },
    heroName: { flex: 1, fontSize: 24, fontWeight: '600', color: C.text },
    // One card for the whole person. The padding lives on the groups instead, so
    // the rules between them run the full width and read as divisions of one
    // thing rather than as gaps between several.
    card: {
      backgroundColor: C.card,
      marginHorizontal: 16,
      marginTop: 18,
      borderRadius: 12,
      overflow: 'hidden',
    },
    group: { padding: 12 },
    groupDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    // The editor's input type without the input: same size and colour, no rule
    // underneath and no padding pretending to be a tap target.
    value: { fontSize: 16, color: C.text },
    inlineValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldValue: { flex: 1 },
    contactBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.contactActionBg,
    },
  });
}
