import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, Image, ScrollView, TouchableOpacity, Switch,
  StyleSheet, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import type { ColorPalette } from '../constants/colors';
import { useSettings } from '../hooks/useSettings';
import { useNotificationToggles } from '../hooks/useNotificationToggles';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { CalendarEvent, RecurringRule, eventTypeColor } from '../utils/eventUtils';
import { addMinutesToTimeString } from '../utils/dateUtils';
import { lightenColor } from '../utils/colorUtils';
import { GoalIcon } from '../components/GoalIcon';
import { ImportContactsModal } from '../modals/ImportContactsModal';

interface Props {
  visible: boolean;
  onComplete: () => void;
}

// Welcome, then one page per tab in the app's own order (Home, Calendar,
// People, Settings), then a closing page. Pages are written inline below
// rather than data-driven — several of them hold interactive state (switches,
// pickers) that a generic pages array would only complicate.
const TOTAL_PAGES = 6;

type ScheduleKind = 'work' | 'student';

interface StarterEntry {
  title: string;
  type: string;
  startTime: string;
  minutes: number;
  recurringRule: RecurringRule;
  recurringDays?: number[];
}

/**
 * The opt-in starter schedule: daily prayer/study/exercise/meals plus one
 * weekday block (Work or School — the only thing that differs by `kind`) and
 * Sunday church. Left with no `recurringUntil` — unlike a user-drawn recurring
 * event, which always gets an end date from the edit form — since this is a
 * routine the person is opting into indefinitely, not a series with a known
 * last occurrence.
 */
function starterEntries(kind: ScheduleKind): StarterEntry[] {
  const work: StarterEntry = { title: 'Work', type: 'work', startTime: '9:00 AM', minutes: 8 * 60, recurringRule: 'weekly', recurringDays: [1, 2, 3, 4, 5] };
  const school: StarterEntry = { title: 'School', type: 'school', startTime: '8:00 AM', minutes: 7 * 60, recurringRule: 'weekly', recurringDays: [1, 2, 3, 4, 5] };

  return [
    { title: 'Morning Prayer', type: 'prayer', startTime: '6:30 AM', minutes: 15, recurringRule: 'daily' },
    { title: 'Scripture Study', type: 'scripture', startTime: '7:00 AM', minutes: 30, recurringRule: 'daily' },
    { title: 'Breakfast', type: 'meal', startTime: '7:30 AM', minutes: 30, recurringRule: 'daily' },
    kind === 'work' ? work : school,
    { title: 'Lunch', type: 'meal', startTime: '12:00 PM', minutes: 30, recurringRule: 'daily' },
    { title: 'Exercise', type: 'exercise', startTime: '5:30 PM', minutes: 30, recurringRule: 'daily' },
    { title: 'Dinner', type: 'meal', startTime: '6:30 PM', minutes: 30, recurringRule: 'daily' },
    { title: 'Nightly Prayer', type: 'prayer', startTime: '10:00 PM', minutes: 15, recurringRule: 'daily' },
    { title: 'Church', type: 'church', startTime: '9:00 AM', minutes: 120, recurringRule: 'weekly', recurringDays: [0] },
  ];
}

function buildStarterSchedule(kind: ScheduleKind, eventTypeColors: Record<string, string>): Omit<CalendarEvent, 'id'>[] {
  const anchor = format(new Date(), 'yyyy-MM-dd');
  return starterEntries(kind).map(entry => ({
    title: entry.title,
    type: entry.type,
    color: eventTypeColor(entry.type, eventTypeColors),
    date: anchor,
    startTime: entry.startTime,
    endTime: addMinutesToTimeString(entry.startTime, entry.minutes),
    recurring: true,
    recurringRule: entry.recurringRule,
    recurringDays: entry.recurringDays,
  }));
}

export function OnboardingScreen({ visible, onComplete }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { toggleDailyReview, toggleEventReminders } = useNotificationToggles();
  const { definitions, updateDefinitions } = useWeeklyGoals();
  const { addEvent, deleteEvent } = useCalendarEvents();

  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const [wantsSchedule, setWantsSchedule] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('work');
  const createdScheduleIds = useRef<string[]>([]);
  // Toggling the switch on and immediately picking a kind fires two overlapping
  // async writes — both would read createdScheduleIds before either finishes,
  // so neither could delete the other's events. Chaining every schedule edit
  // onto this queue forces them to run one at a time, in the order tapped.
  const scheduleQueue = useRef<Promise<void>>(Promise.resolve());

  const [showImport, setShowImport] = useState(false);

  // Kept mounted only while visible — cheapest way to guarantee a replay from
  // Settings always starts on page one instead of resuming wherever a prior
  // pass through this flow left off.
  useEffect(() => {
    if (visible) {
      setPage(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      setWantsSchedule(false);
      setScheduleKind('work');
      createdScheduleIds.current = [];
      scheduleQueue.current = Promise.resolve();
    }
  }, [visible]);

  if (!visible) return null;

  const isLast = page === TOTAL_PAGES - 1;

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(TOTAL_PAGES - 1, index));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setPage(clamped);
  }

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function enqueueScheduleOp(op: () => Promise<void>): void {
    scheduleQueue.current = scheduleQueue.current.then(op, op);
  }

  async function applyStarterSchedule(kind: ScheduleKind) {
    for (const id of createdScheduleIds.current) await deleteEvent(id);
    const created: string[] = [];
    for (const draft of buildStarterSchedule(kind, settings.eventTypeColors)) {
      const row = await addEvent(draft);
      created.push(row.id);
    }
    createdScheduleIds.current = created;
  }

  async function clearStarterSchedule() {
    for (const id of createdScheduleIds.current) await deleteEvent(id);
    createdScheduleIds.current = [];
  }

  function handleToggleSchedule(value: boolean) {
    setWantsSchedule(value);
    enqueueScheduleOp(() => (value ? applyStarterSchedule(scheduleKind) : clearStarterSchedule()));
  }

  function handleSelectScheduleKind(kind: ScheduleKind) {
    setScheduleKind(kind);
    if (wantsSchedule) enqueueScheduleOp(() => applyStarterSchedule(kind));
  }

  function toggleGoalVisible(id: string) {
    updateDefinitions(definitions.map(d => (d.id === id ? { ...d, visible: !d.visible } : d)));
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        {!isLast && (
          <TouchableOpacity style={[styles.skip, { top: insets.top + 12 }]} onPress={onComplete} hitSlop={12}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          ref={scrollRef}
          style={styles.pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {/* Welcome */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <Image source={require('../../assets/icon.png')} style={styles.heroImage} />
            <Text style={styles.title}>Welcome to RM Book</Text>
            <Text style={styles.body}>
              Your companion for the next chapter. Let's take a quick look around: Home for your
              weekly goals, Calendar to log your days, People for those who matter most, and
              Settings to make it yours.
            </Text>
          </ScrollView>

          {/* Home — weekly goals */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="home" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Home: your weekly goals</Text>
            <Text style={styles.body}>
              Pick which of these goals you want to track. You can add new ones or unhide
              these anytime.
            </Text>
            <View style={styles.card}>
              {definitions.filter(d => d.builtIn).map((def, i, arr) => (
                <View key={def.id} style={[styles.goalRow, i === arr.length - 1 && styles.rowLast]}>
                  <View style={[styles.goalIconWrap, { backgroundColor: isDark ? def.color : def.color + '20' }]}>
                    <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={16} color={isDark ? lightenColor(def.color) : def.color} />
                  </View>
                  <Text style={styles.goalLabel}>{def.label}</Text>
                  <Switch
                    value={def.visible}
                    onValueChange={() => toggleGoalVisible(def.id)}
                    trackColor={{ true: Colors.control }}
                    thumbColor={Colors.white}
                  />
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Calendar — starter schedule */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Calendar: log your days</Text>
            <Text style={styles.body}>
              Add prayer, scripture study, church, exercise, and more to your calendar. Marking
              them complete counts toward your weekly goals automatically. You can add events
              at any time.
            </Text>
            <View style={styles.card}>
              <View style={[styles.toggleRow, !wantsSchedule && styles.rowLast]}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Starter Schedule</Text>
                  <Text style={styles.toggleHint}>Prayer, study, meals, exercise, and Sunday church, repeating.</Text>
                </View>
                <Switch
                  value={wantsSchedule}
                  onValueChange={handleToggleSchedule}
                  trackColor={{ true: Colors.control }}
                  thumbColor={Colors.white}
                />
              </View>
              {wantsSchedule && (
                <View style={[styles.scheduleKindRow, styles.rowLast]}>
                  {(['work', 'student'] as const).map(kind => (
                    <TouchableOpacity
                      key={kind}
                      style={[styles.pill, scheduleKind === kind && styles.pillActive]}
                      onPress={() => handleSelectScheduleKind(kind)}
                    >
                      <Text style={[styles.pillText, scheduleKind === kind && styles.pillTextActive]}>
                        {kind === 'work' ? "I work" : "I'm a student"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            {wantsSchedule && (
              <Text style={styles.footnote}>
                You can edit or delete any of these anytime from the Calendar tab.
              </Text>
            )}
          </ScrollView>

          {/* People — import contacts */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>People: those who matter most</Text>
            <Text style={styles.body}>
              Save contact info, favorite the people you don't want to lose touch with, and see
              your history together at a glance. You can add people at any time.
            </Text>
            <TouchableOpacity style={styles.importCard} onPress={() => setShowImport(true)} activeOpacity={0.8}>
              <View style={styles.importIconWrap}>
                <Ionicons name="download-outline" size={22} color={Colors.onPrimary} />
              </View>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Import from Contacts</Text>
                <Text style={styles.toggleHint}>Pull names and numbers in from your phone.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          </ScrollView>

          {/* Settings — notifications and a couple of preferences */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="settings" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Settings: make it yours</Text>
            <Text style={styles.body}>
              Turn on reminders now, or leave them off. These can be changed anytime from the
              Settings tab.
            </Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Daily Review</Text>
                  <Text style={styles.toggleHint}>A nightly nudge to report today's events.</Text>
                </View>
                <Switch
                  value={settings.dailyReviewEnabled}
                  onValueChange={toggleDailyReview}
                  trackColor={{ true: Colors.control }}
                  thumbColor={Colors.white}
                />
              </View>
              <View style={[styles.toggleRow, styles.rowLast]}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Event Reminders</Text>
                  <Text style={styles.toggleHint}>A heads-up shortly before each event starts.</Text>
                </View>
                <Switch
                  value={settings.eventReminderEnabled}
                  onValueChange={toggleEventReminders}
                  trackColor={{ true: Colors.control }}
                  thumbColor={Colors.white}
                />
              </View>
            </View>
            <View style={styles.card}>
              <View style={styles.prefRow}>
                <Text style={styles.toggleLabel}>Theme</Text>
                <View style={styles.prefPills}>
                  {(['light', 'dark', 'system'] as const).map(theme => (
                    <TouchableOpacity
                      key={theme}
                      style={[styles.pillSmall, settings.theme === theme && styles.pillActive]}
                      onPress={() => updateSettings({ theme })}
                    >
                      <Text style={[styles.pillTextSmall, settings.theme === theme && styles.pillTextActive]}>
                        {theme.charAt(0).toUpperCase() + theme.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[styles.prefRow, styles.rowLast]}>
                <Text style={styles.toggleLabel}>Week Start</Text>
                <View style={styles.prefPills}>
                  {(['sunday', 'monday'] as const).map(day => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.pillSmall, settings.weekStart === day && styles.pillActive]}
                      onPress={() => updateSettings({ weekStart: day })}
                    >
                      <Text style={[styles.pillTextSmall, settings.weekStart === day && styles.pillTextActive]}>
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Ready */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>You're all set</Text>
            <Text style={styles.scripture}>
              "But be ye doers of the word, and not hearers only."
            </Text>
            <Text style={styles.scriptureRef}>— James 1:22</Text>
          </ScrollView>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.footerButtons}>
            {page > 0 ? (
              <TouchableOpacity style={styles.backButton} onPress={() => goTo(page - 1)} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.backButtonSpacer} />
            )}
            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => (isLast ? onComplete() : goTo(page + 1))}
            >
              <Text style={styles.nextButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
              {!isLast && <Ionicons name="chevron-forward" size={18} color={Colors.onPrimary} style={{ marginLeft: 2 }} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ImportContactsModal visible={showImport} onClose={() => setShowImport(false)} />
    </Modal>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    pager: { flex: 1 },
    skip: {
      position: 'absolute',
      right: 20,
      zIndex: 1,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    skipText: { fontSize: 15, color: C.textSecondary },
    page: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 24,
    },
    heroImage: {
      width: 96,
      height: 96,
      borderRadius: 24,
      marginBottom: 24,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: C.textSecondary,
      textAlign: 'center',
    },
    scripture: {
      fontSize: 16,
      color: C.textSecondary,
      fontStyle: 'italic',
      lineHeight: 24,
      textAlign: 'center',
    },
    scriptureRef: {
      fontSize: 13,
      color: C.textLight,
      marginTop: 8,
    },
    card: {
      width: '100%',
      backgroundColor: C.card,
      borderRadius: 16,
      marginTop: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    goalIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    goalLabel: { flex: 1, fontSize: 14, color: C.text },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowLast: { borderBottomWidth: 0 },
    toggleTextGroup: { flex: 1, marginRight: 12 },
    toggleLabel: { fontSize: 15, color: C.text, marginBottom: 2 },
    toggleHint: { fontSize: 12, color: C.textLight },
    scheduleKindRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 10,
    },
    pill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: C.contactActionBg,
    },
    pillActive: { backgroundColor: C.control },
    pillText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
    pillTextActive: { color: C.white },
    footnote: {
      fontSize: 12,
      color: C.textLight,
      textAlign: 'center',
      marginTop: 10,
    },
    importCard: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      backgroundColor: C.card,
      borderRadius: 16,
      marginTop: 24,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    importIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.control,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    prefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    prefPills: { flexDirection: 'row', gap: 8 },
    pillSmall: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: C.contactActionBg,
    },
    pillTextSmall: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
    footer: { paddingHorizontal: 20, paddingTop: 8 },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 16,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: C.border,
      marginHorizontal: 4,
    },
    dotActive: { backgroundColor: C.primary, width: 20 },
    footerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonSpacer: { width: 44, height: 44 },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.primary,
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    nextButtonText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
  });
}
