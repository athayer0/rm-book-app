import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
  settings: AppSettings;
  /** Notes the attempt against this person, then hands off to the other app. */
  onContact: (method: string, open: () => void) => void;
  /** Absent hides the trash icon — the caller owns confirmation and the actual delete. */
  onDelete?: () => void;
}

/**
 * A person as they stand, with nothing offering to be typed in.
 *
 * The same uppercase labels as the editor, minus every affordance: no rules under
 * the values, no chevron on the status, no × on a contact method. Unlike the
 * editor, which gives each field a card of its own, everything here — starting
 * with their name, under a NAME label like any other field — shares one card and
 * is separated by rules, reading as a page about the person rather than a stack
 * of things to fill in.
 *
 * What stays live are the actions — call, text, WhatsApp, Messenger, Maps — since
 * those do something to the world rather than edit the record, plus the trash,
 * which sits beside the name the same way it sits beside an event's title.
 *
 * Empty fields are dropped rather than shown blank, so what's here is what the
 * person actually has.
 */
export function PersonDetailView({
  name, status, phone, whatsapp, messenger, address, notes, settings, onContact, onDelete,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

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
    key: 'name',
    node: (
      <>
        <Text style={styles.label}>{t('personFields.name')}</Text>
        <View style={styles.nameRow}>
          <Text style={[styles.value, styles.nameValue]}>{trimmedName || t('personDetail.unnamed')}</Text>
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('personDetail.deletePerson')}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </>
    ),
  });

  groups.push({
    key: 'status',
    node: (
      <>
        <Text style={styles.label}>{t('personFields.status')}</Text>
        <View style={styles.inlineValue}>
          {PERSON_STATUSES[status] && <StatusIcon config={PERSON_STATUSES[status]} size={14} />}
          <Text style={styles.value}>{statusDisplayName(status, t)}</Text>
        </View>
      </>
    ),
  });

  if (phoneText.length > 0) {
    groups.push({
      key: 'phone',
      node: (
        <>
          <Text style={styles.label}>{t('personFields.phone')}</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{phoneText}</Text>
            {dialable.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => onContact('text', () => messageNumber(phone, t))}
                  accessibilityRole="button"
                  accessibilityLabel={trimmedName ? t('personDetail.messageWithName', { name: trimmedName }) : t('personDetail.messageThisNumber')}
                >
                  <Ionicons name="chatbubble" size={17} color={Colors.control} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => onContact('phone', () => callNumber(phone, t))}
                  accessibilityRole="button"
                  accessibilityLabel={trimmedName ? t('personDetail.callWithName', { name: trimmedName }) : t('personDetail.callThisNumber')}
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
          <Text style={styles.label}>{t('personFields.whatsapp')}</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{whatsappText}</Text>
            {whatsappDialable.length > 0 && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => onContact('whatsapp', () => openWhatsApp(whatsapp, settings.defaultCountryCode, t))}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? t('personDetail.whatsappWithName', { name: trimmedName }) : t('personDetail.openInWhatsapp')}
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
          <Text style={styles.label}>{t('personFields.messenger')}</Text>
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
                onPress={() => onContact('messenger', () => openMessenger(messenger, t))}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? t('personDetail.messageOnMessengerWithName', { name: trimmedName }) : t('personDetail.openInMessenger')}
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
          <Text style={styles.label}>{t('personFields.address')}</Text>
          <View style={styles.fieldRow}>
            <Text style={[styles.value, styles.fieldValue]}>{addressText}</Text>
            {/* Not routed through onContact: looking up where someone lives isn't
                a contact, and often isn't even a visit. */}
            {mapQuery.length > 0 && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => openMaps(address, settings.mapsApp, t)}
                accessibilityRole="button"
                accessibilityLabel={trimmedName ? t('personDetail.openAddressWithName', { name: trimmedName }) : t('personDetail.openThisAddress')}
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
          <Text style={styles.label}>{t('personFields.notes')}</Text>
          <Text style={styles.value}>{notesText}</Text>
        </>
      ),
    });
  }

  return (
    <ScrollView style={styles.scroll} bounces={false} overScrollMode="never">
      <View style={styles.cardShadow}>
      <View style={styles.card}>
        {groups.map((group, i) => (
          <View key={group.key} style={[styles.group, i > 0 && styles.groupDivided]}>
            {group.node}
          </View>
        ))}
      </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.background },
    // A labelled group like every other, not a hero: the name is one of the
    // person's fields, and the event page states its title the same way.
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nameValue: { flex: 1 },
    // One card for the whole person. The padding lives on the groups instead, so
    // the rules between them run the full width and read as divisions of one
    // thing rather than as gaps between several.
    // Shadow only — kept off `card` because overflow:'hidden' clips a shadow
    // along with everything else, which on iOS erases it outright.
    cardShadow: {
      marginHorizontal: 16,
      marginTop: 18,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
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
