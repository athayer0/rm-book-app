import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';
import { Person } from '../hooks/usePeople';
import { PERSON_STATUSES, STATUS_OPTIONS, statusDisplayName } from '../constants/personStatuses';
import { StatusIcon } from '../components/StatusIcon';
import { DropdownMenu, DropdownItem, MENU_ITEM_HEIGHT } from '../components/DropdownMenu';
import { SheetModal } from '../components/SheetModal';
import { useSettings } from '../hooks/useSettings';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { usePendingContact } from '../hooks/usePendingContact';
import { CalendarEvent } from '../utils/eventUtils';
import { AddEditEventModal } from './AddEditEventModal';
import { PersonTimelineTab } from '../components/PersonTimelineTab';
import { PersonDetailView } from '../components/PersonDetailView';
import { EdgeFade, TextWidthProbe } from '../components/ScrollableValue';
import { ScrollEdgeFade, useScrollEdges } from '../components/ScrollEdgeFade';
// Only the readers are left here. Dialling, messaging and mapping are the display
// view's, so this file no longer knows how to open another app.
import { isFacebookShareLink, toMessengerHandle } from '../utils/phoneUtils';

// Thirteen statuses is far more than a menu should ever be tall, so the list
// scrolls. Ends on half a row rather than a whole one, which is what says there
// is more below without needing a scrollbar to be visible to say it.
const STATUS_LIST_MAX_HEIGHT = MENU_ITEM_HEIGHT * 4.5;

interface Props {
  visible: boolean;
  person?: Person | null;
  onSave: (person: Omit<Person, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function AddEditPersonModal({ visible, person, onSave, onDelete, onClose }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const [name, setName] = useState('');
  const [status, setStatus] = useState('Other');
  const [phone, setPhone] = useState('');
  // null means the section is not on this person. '' means it is, but empty.
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [messenger, setMessenger] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [starred, setStarred] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  /**
   * Which group wins the paint order. Lags the two booleans on the way down and
   * only ever moves to the other picker, never back to null: a menu animates out
   * over ~130ms, and its boolean is already false for all of it, so dropping the
   * zIndex on close would send the menu behind the fields below for its whole
   * exit. Leaving the last group elevated afterwards is harmless — nothing is
   * drawn there to overlap anything.
   */
  const statusScrollEdges = useScrollEdges();
  const [elevated, setElevated] = useState<'status' | 'method' | null>(null);
  useEffect(() => {
    if (showStatusPicker) setElevated('status');
    else if (showMethodPicker) setElevated('method');
  }, [showStatusPicker, showMethodPicker]);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');
  /**
   * Someone who already exists opens as a page about themselves; only editing
   * them shows the form. Someone being added has nothing to display, so they
   * start in the form and never return here — Cancel and Save both close it.
   */
  const [mode, setMode] = useState<'view' | 'edit'>(person ? 'view' : 'edit');

  /**
   * Seed every field from the person, or clear them for a new one.
   *
   * Also what Cancel calls: leaving edit mode has to put back what was there,
   * since the sheet stays open on the display view rather than being torn down.
   */
  function resetForm() {
    if (person) {
      setName(person.name);
      setStatus(person.status);
      setPhone(person.phone ?? '');
      setWhatsapp(person.whatsapp ?? null);
      setMessenger(person.messenger ?? null);
      setAddress(person.address ?? null);
      setNotes(person.notes ?? '');
      setStarred(person.starred);
    } else {
      setName('');
      setStatus('Other');
      setPhone('');
      setWhatsapp(null);
      setMessenger(null);
      setAddress(null);
      setNotes('');
      setStarred(false);
    }
    setShowStatusPicker(false);
    setShowMethodPicker(false);
  }

  useEffect(() => {
    resetForm();
    setActiveTab('details');
    setMode(person ? 'view' : 'edit');
    // resetForm reads only `person`, which is listed. eslint can't see that
    // through the function, so the check is answered here rather than by
    // wrapping it in a useCallback nothing else needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, visible]);

  const { settings } = useSettings();
  const { addEvent } = useCalendarEvents();
  const { noteAttempt, captured, clearCaptured } = usePendingContact();
  const messengerHandle = toMessengerHandle(messenger);
  // How wide the Messenger URL wants to be against how much room its field has,
  // which is what decides whether to mark the field as continuing past its edge.
  const [messengerTextWidth, setMessengerTextWidth] = useState(0);
  const [messengerFieldWidth, setMessengerFieldWidth] = useState(0);

  /**
   * Leave a note that a contact is being made, then hand off to the other app.
   *
   * Reaches here from the display view, which is where the call, message and map
   * buttons live — the form is for changing a number, not for using it. Only a
   * person who already exists gets the note: the draft attaches them by id, and
   * an unsaved new person has none yet.
   */
  function contactVia(method: string, open: () => void) {
    if (person) noteAttempt(method);
    open();
  }

  // Seeds the Contact draft that opens on return. Memoised because
  // AddEditEventModal resets its form whenever this identity changes — rebuilt
  // inline, it would clear the sheet on every keystroke.
  const contactDraft = useMemo<Partial<CalendarEvent> | null>(() => {
    if (!captured || !person) return null;
    return {
      type: 'contact',
      // No title: the draft leaves it blank so it saves as "Contact", the type's
      // own label. Who it was with is carried by `people`, not by the title.
      date: captured.date,
      startTime: captured.startTime,
      endTime: captured.startTime, // no end time until one is asked for
      people: [person.id],
      contactMethod: captured.method,
    };
  }, [captured, person]);

  const methodOptions = [
    {
      key: 'whatsapp' as const,
      label: 'WhatsApp',
      present: whatsapp !== null,
      // Seeded from the phone field at the moment it's added, then left alone —
      // later edits to the phone number do not follow, so the two can differ.
      add: () => setWhatsapp(phone.trim()),
    },
    {
      key: 'messenger' as const,
      label: 'Messenger',
      present: messenger !== null,
      add: () => setMessenger(''),
    },
  ];
  const availableMethods = methodOptions.filter(m => !m.present);

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      status,
      phone: phone.trim(),
      // undefined, not '', for a removed section: toRow maps it to a null column,
      // so the removal reaches the other devices instead of leaving a blank behind.
      whatsapp: whatsapp === null ? undefined : whatsapp.trim(),
      messenger: messenger === null ? undefined : messenger.trim(),
      address: address === null ? undefined : address.trim(),
      notes: notes.trim(),
      starred,
    });
    // Someone who already exists has a page to go back to; a new person does not.
    if (person) setMode('view'); else onClose();
  }

  function handleCancel() {
    if (!person) { onClose(); return; }
    resetForm();
    setMode('view');
  }

  /**
   * Dismiss both dropdowns, which float over the rows beneath them.
   *
   * Every control in the card calls this, because the card has to sit above the
   * dismiss backdrop for either dropdown to be visible at all — which means taps
   * landing on a control no longer reach the backdrop.
   *
   * Status used to be exempt: it sat in the flow and pushed the rows below it
   * down, so it had no backdrop to be shut out of. Now that it floats like the
   * method picker, it needs the same dismissal or there would be no way to close
   * it but to choose something.
   */
  function closePickers() {
    setShowMethodPicker(false);
    setShowStatusPicker(false);
  }

  const viewing = mode === 'view' && !!person;

  return (
    <SheetModal visible={visible} onClose={onClose}>
        <View style={styles.header}>
          {viewing ? (
            <>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Person</Text>
              <TouchableOpacity onPress={() => setMode('edit')} style={styles.headerRightBtn}>
                <Text style={styles.save}>Edit</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* The glyph says which of the two things leaving does. Editing a
                  person who exists steps back to the page about them, so an arrow;
                  a new person has no page behind them and the form is the sheet,
                  so an ×, the same mark that closes it from the display view. */}
              <TouchableOpacity
                onPress={handleCancel}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel={person ? 'Back' : 'Close'}
              >
                {person
                  ? <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
                  : <Ionicons name="close" size={22} color={Colors.textSecondary} />}
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{person ? 'Edit Person' : 'Add Person'}</Text>
              <TouchableOpacity onPress={handleSave} style={styles.headerRightBtn}>
                <Text style={styles.save}>Save</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Only for someone who already exists — a person being added has no id
            for the timeline to look events up by, and no events to find. */}
        {person && (
          <View style={styles.tabBar}>
            {(['details', 'timeline'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={styles.tabBtn}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'details' ? 'Details' : 'Timeline'}
                </Text>
                {activeTab === tab && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {person && activeTab === 'timeline' && <PersonTimelineTab personId={person.id} />}

        {viewing && activeTab === 'details' && (
          <PersonDetailView
            name={name}
            status={status}
            phone={phone}
            whatsapp={whatsapp}
            messenger={messenger}
            address={address}
            notes={notes}
            starred={starred}
            settings={settings}
            onContact={contactVia}
          />
        )}

        {/* Kept mounted while the timeline shows, not swapped out: unmounting would
            discard every unsaved edit in the form the moment the tab changed. The
            display view has no draft to lose, so it goes the other way and is
            simply not rendered while the form is up. */}
        {!viewing && (
        <ScrollView
          style={[styles.form, activeTab !== 'details' && styles.formHidden]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          bounces={false}
          overScrollMode="never"
        >
          {(showMethodPicker || showStatusPicker) && (
            <Pressable style={styles.pickerBackdrop} onPress={closePickers} />
          )}
          <View style={styles.card}>
          {(showMethodPicker || showStatusPicker) && (
            <Pressable style={styles.cardBackdrop} onPress={closePickers} />
          )}
          <View style={styles.group}>
            <Text style={styles.label}>Name</Text>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.input, styles.fieldInput]}
                value={name}
                onChangeText={setName}
                onFocus={closePickers}
                placeholder="Full name"
                placeholderTextColor={Colors.textLight}
              />
              {/* The favourite toggle lives on the name row rather than in a
                  labelled section of its own — it is one bit about the person,
                  and the filled star already says which way it is set. */}
              <TouchableOpacity
                onPress={() => { closePickers(); setStarred(!starred); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: starred }}
                accessibilityLabel={starred ? 'Remove from favorites' : 'Mark as favorite'}
              >
                <Ionicons
                  name={starred ? 'star' : 'star-outline'}
                  size={22}
                  color={starred ? Colors.favorite : Colors.textLight}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.group, styles.pickerRow, elevated === 'status' && styles.openPickerRow]}>
            {/* Half a row, with the other half left empty. The list anchors to
                the trigger itself rather than to the whole row, so it opens at
                exactly the width the closed field already showed — a menu
                twice the width of the control it belongs to reads as belonging
                to something else. */}
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.label}>Status</Text>
                <View>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => { closePickers(); setShowStatusPicker(!showStatusPicker); }}
                  >
                    {PERSON_STATUSES[status] && (
                      <StatusIcon config={PERSON_STATUSES[status]} size={14} style={{ marginRight: 6 }} />
                    )}
                    <Text style={styles.pickerText} numberOfLines={1}>{statusDisplayName(status)}</Text>
                    <Ionicons name={showStatusPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                  <DropdownMenu open={showStatusPicker}>
                    <ScrollView
                      style={{ maxHeight: STATUS_LIST_MAX_HEIGHT }}
                      nestedScrollEnabled
                      bounces={false}
                      overScrollMode="never"
                      {...statusScrollEdges.scrollViewProps}
                    >
                      {STATUS_OPTIONS.map((s, i) => (
                        <DropdownItem
                          key={s}
                          label={statusDisplayName(s)}
                          selected={status === s}
                          showSeparator={i < STATUS_OPTIONS.length - 1}
                          leading={<StatusIcon config={PERSON_STATUSES[s]} size={14} style={{ marginRight: 8 }} />}
                          onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                        />
                      ))}
                    </ScrollView>
                    <ScrollEdgeFade edge="top" color={Colors.menuSurface} visible={statusScrollEdges.showTopFade} />
                    <ScrollEdgeFade edge="bottom" color={Colors.menuSurface} visible={statusScrollEdges.showBottomFade} />
                  </DropdownMenu>
                </View>
              </View>
              <View style={styles.column} />
            </View>
          </View>

          <View style={[styles.group, styles.columns]}>
            <View style={styles.column}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                onFocus={closePickers}
                placeholder="Phone number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.column} />
          </View>

          {/* Half a row, header included, so the × that removes the section stays
              over the right edge of the field it belongs to. Messenger and
              Address keep the full width — a profile URL and a street address
              both need it. */}
          {whatsapp !== null && (
            <View style={[styles.group, styles.columns]}>
              <View style={styles.column}>
                <View style={styles.methodHeader}>
                  <Text style={styles.label}>WhatsApp</Text>
                  <TouchableOpacity
                    onPress={() => { closePickers(); setWhatsapp(null); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove WhatsApp"
                  >
                    <Ionicons name="close" size={18} color={Colors.textLight} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  onFocus={closePickers}
                  placeholder="WhatsApp number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.column} />
            </View>
          )}

          {messenger !== null && (
            <View style={[styles.group]}>
              <View style={styles.methodHeader}>
                <Text style={styles.label}>Messenger</Text>
                <TouchableOpacity
                  onPress={() => { closePickers(); setMessenger(null); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove Messenger"
                >
                  <Ionicons name="close" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
              {/*
                A profile URL routinely runs past the field. The input scrolls
                through it natively once focused, so all this adds is the mark
                saying there is more to reach — measured against a probe, since a
                TextInput reports nothing about its own overflow. The mark is not
                directional the way the display view's is: nothing here can
                observe how far the input has been scrolled, so it stands for
                "longer than it looks" rather than "more to the right".
              */}
              <View onLayout={e => setMessengerFieldWidth(e.nativeEvent.layout.width)}>
                <TextInput
                  style={styles.input}
                  value={messenger}
                  onChangeText={setMessenger}
                  onFocus={closePickers}
                  placeholder="Profile link or username"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <TextWidthProbe
                  value={messenger}
                  textStyle={styles.input}
                  onMeasure={setMessengerTextWidth}
                />
                {messengerTextWidth > messengerFieldWidth + 1 && (
                  // Held clear of the field's own rule, which the fade would
                  // otherwise rub out for its last 32 points.
                  <EdgeFade color={Colors.card} side="right" style={{ bottom: 1 }} />
                )}
              </View>
              {messengerHandle.length > 0 && !/^\d+$/.test(messengerHandle) && (
                <Text style={styles.fieldHint}>
                  Opens through m.me, which may bounce via the browser. Saving their
                  profile.php?id=… link instead jumps straight into Messenger.
                </Text>
              )}
              {messenger.trim().length > 0 && messengerHandle.length === 0 && (
                <Text style={styles.fieldHint}>
                  {isFacebookShareLink(messenger)
                    ? 'That’s a share link — only Facebook can expand it. Open it in a browser, then copy the facebook.com/… address it lands on.'
                    : 'Couldn’t read a profile out of that. Paste their facebook.com or m.me link, or just their username.'}
                </Text>
              )}
            </View>
          )}

          {availableMethods.length > 0 && (
            <View style={[
              styles.group,
              styles.pickerRow,
              elevated === 'method' && styles.openPickerRow,
            ]}>
              {/* Trigger and dropdown share a wrapper so the dropdown hangs off the
                  row itself, not the group's padding box — same as the time
                  pickers in AddEditEventModal. */}
              <View>
                {/* No chevron. A chevron says "this field has a value you can
                    change"; this row has no value, it is an action that happens
                    to ask which one first. The ＋ already says so, and the
                    identical "Add address" row below has never had one. */}
                <TouchableOpacity
                  style={styles.addMethodRow}
                  // Shuts the status menu on the way, the same as every other
                  // control in the card. It didn't have to when status sat in
                  // the flow; now that both float, opening one over the other
                  // would leave two menus on screen at once.
                  onPress={() => { setShowStatusPicker(false); setShowMethodPicker(v => !v); }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.control} />
                  <Text style={styles.addMethodText}>Add contact method</Text>
                </TouchableOpacity>
                <DropdownMenu open={showMethodPicker}>
                  {availableMethods.map((method, i) => (
                    <DropdownItem
                      key={method.key}
                      label={method.label}
                      showSeparator={i < availableMethods.length - 1}
                      leading={
                        <MaterialCommunityIcons
                          name={method.key === 'whatsapp' ? 'whatsapp' : 'facebook-messenger'}
                          size={18}
                          color={Colors.control}
                          style={{ marginRight: 8 }}
                        />
                      }
                      onPress={() => { method.add(); setShowMethodPicker(false); }}
                    />
                  ))}
                </DropdownMenu>
              </View>
            </View>
          )}

          {/* Address sits below the contact methods and their picker, so the
              group it opens takes the place the button occupied rather than
              appearing somewhere further up the form. */}
          {address !== null && (
            <View style={[styles.group]}>
              <View style={styles.methodHeader}>
                <Text style={styles.label}>Address</Text>
                <TouchableOpacity
                  onPress={() => { closePickers(); setAddress(null); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove address"
                >
                  <Ionicons name="close" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                onFocus={closePickers}
                placeholder="Street, city, state"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Its own row, not an entry in the dropdown above: there is only ever
              one address, so there is nothing to choose between. */}
          {address === null && (
            <View style={[styles.group]}>
              <TouchableOpacity
                style={styles.addMethodRow}
                onPress={() => { closePickers(); setAddress(''); }}
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.control} />
                <Text style={styles.addMethodText}>Add address</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.group]}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              onFocus={closePickers}
              placeholder="Notes about this person..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
            />
          </View>
          </View>

          {person && onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => { onDelete(person.id); onClose(); }}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              <Text style={styles.deleteText}>Delete Person</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
        )}

        {/*
          Nested inside this sheet rather than sitting beside it in the screen,
          for the reason UnreportedEventsModal spells out: two Modals as siblings
          race to present from the same view controller, while one declared
          within another's content presents from that one and stacks cleanly.
          This editor is necessarily still open — the contact was started from
          one of its own buttons.

          Nothing is written until Save. Closing discards the draft, so a
          misdialled number or an abandoned call leaves no event behind.
        */}
        <AddEditEventModal
          visible={contactDraft !== null}
          event={null}
          prefill={contactDraft}
          settings={settings}
          onSave={async eventData => { await addEvent(eventData); }}
          onClose={clearCaptured}
        />
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
      fontSize: 18,
      fontWeight: '700',
      color: C.text,
    },
    // The display header's ×-and-Edit pair, sized the way WeeklyPlanningModal
    // sizes its close button: equal 60pt slots on both ends so the title sits
    // centred whatever the right-hand label says.
    closeBtn: { width: 60, alignItems: 'flex-start' },
    headerRightBtn: { width: 60, alignItems: 'flex-end' },
    save: { fontSize: 16, fontWeight: '600', color: C.accent },
    // Same two-tab bar as the weekly planning sheet, so switching panes reads the
    // same way wherever the app does it.
    tabBar: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      position: 'relative',
    },
    tabLabel: { fontSize: 14, fontWeight: '600', color: C.textSecondary },
    tabLabelActive: { color: C.control },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 1,
      backgroundColor: C.control,
    },
    form: { flex: 1, backgroundColor: C.background },
    // Collapsed rather than unmounted. display:'none' also drops it out of the
    // touch tree, so the hidden form can't intercept taps meant for the timeline.
    formHidden: { display: 'none' },
    /**
     * One card for the whole form, the way the display view has one for the whole
     * person. The padding lives on the groups instead, so the rules between them
     * run the full width and the fields read as parts of one thing.
     *
     * Deliberately no `overflow: 'hidden'`: the contact-method dropdown hangs
     * below its row near the card's own bottom edge. Rounded corners survive
     * without it, since every rule is interior.
     *
     * The zIndex is what lifts the card over the dismiss backdrop; without it the
     * dropdown paints behind. It costs the backdrop its claim on taps that land
     * on a control, so the controls in here close the picker themselves.
     */
    card: {
      backgroundColor: C.card,
      marginHorizontal: 16,
      // 18, matching PersonDetailView's card exactly. Tapping EDIT swaps one for
      // the other in place, so any difference here is a jump in something that
      // should read as the same card gaining fields, not as a new screen.
      marginTop: 18,
      borderRadius: 12,
      zIndex: 20,
    },
    // No rule between groups: the form is already full of hairlines under the
    // fields themselves, and a second kind of line reads as another one of those
    // rather than as a division. The labels carry the separation instead.
    group: { padding: 12 },
    // A field that only wants half a group's width. The second column is left
    // empty rather than the field being given a percentage, so a half here lines
    // up exactly with a half in the event form.
    columns: { flexDirection: 'row', gap: 8 },
    column: { flex: 1 },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    input: {
      fontSize: 16,
      color: C.text,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      paddingVertical: 4,
    },
    // An input with something beside it. Only the name row's star is left: the
    // call, message and map buttons moved to the display view, where using a
    // number is what you're there to do.
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fieldInput: {
      flex: 1,
    },
    fieldHint: {
      fontSize: 12,
      color: C.textLight,
      marginTop: 8,
    },
    // The label inside already carries the 8pt gap the other sections use.
    methodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    addMethodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addMethodText: {
      flex: 1,
      fontSize: 15,
      color: C.control,
      fontWeight: '500',
    },
    notesInput: {
      minHeight: 56,
      textAlignVertical: 'top',
      paddingTop: 4,
    },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    pickerText: { flex: 1, fontSize: 16, color: C.text },
    // Layers within the card, low to high: plain groups (auto) < any group holding
    // a picker trigger (20) < the group whose picker is open (30). Keeping triggers
    // above their neighbours is what lets one tap move between pickers instead of
    // only dismissing. zIndex only — elevation would paint an Android shadow onto
    // the rows themselves.
    pickerRow: { zIndex: 20 },
    openPickerRow: { zIndex: 30 },
    /**
     * Dismisses an open picker on a tap outside the card. Stays below the card
     * (20), so it covers the form's surroundings only.
     */
    pickerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      zIndex: 10,
    },
    /**
     * The same job for taps that land *on* the card — a label, the padding
     * between fields. It has to be a child of the card rather than a second
     * sibling above it: a subview can never paint above a sibling of its
     * parent, so a backdrop outranking the card outranks everything in it,
     * open menu included, and the menu stops taking taps at all.
     *
     * Inside, the card's own layering does the work: 25 covers the groups that
     * merely hold a trigger (pickerRow, 20) while the group whose picker is
     * open (openPickerRow, 30) stays above it.
     *
     * Not a Pressable wrapped around the card, which is the other obvious way
     * to reach the dead space — that puts a touch responder over every field
     * and breaks any child needing a move gesture rather than a tap. See the
     * matching note in AddEditEventModal, where it stopped the time wheels
     * scrolling.
     */
    cardBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 25,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: C.danger + '12',
    },
    deleteText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.danger,
    },
  });
}
