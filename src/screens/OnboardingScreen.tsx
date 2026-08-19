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
import { DEFAULT_EVENT_TYPES } from '../constants/eventTypeDefaults';
import { DEFAULT_GOALS } from '../constants/defaultGoals';
import {
  EVENT_COLOR_SCHEMES, GOAL_COLOR_SCHEMES,
  matchEventColorScheme, matchGoalColorScheme, schemePreviewColors,
} from '../constants/colorSchemes';
import { useSettings, AppSettings } from '../hooks/useSettings';
import { useNotificationToggles } from '../hooks/useNotificationToggles';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { CalendarEvent, RecurringRule, eventTypeColor } from '../utils/eventUtils';
import { addMinutesToTimeString } from '../utils/dateUtils';
import { lightenColor } from '../utils/colorUtils';
import { GoalIcon } from '../components/GoalIcon';
import { ImportContactsModal } from '../modals/ImportContactsModal';

interface Props {
  visible: boolean;
  /** Hides the modal and marks onboarding done, before the commit writes below have finished. */
  onDismiss: () => void;
  /** Fires once every commit write has actually landed. */
  onFinished: () => void;
}

// Welcome, then Event Types (which both the goal list and the starter
// schedule below it read from), then one page per remaining tab in the app's
// own order (Home, Calendar, People, Settings), then a closing page. Pages
// are written inline below rather than data-driven, since several of them
// hold interactive state a generic pages array would only complicate.
//
// Nothing on any page writes to storage as it's touched. Every switch and pill
// here only edits local draft state; the whole thing is committed in one pass
// by commitAndComplete(), which runs on both "Get Started" and "Skip". That
// makes Skip a shortcut to the end rather than a cancel: whatever was already
// chosen on earlier pages still takes effect.
const TOTAL_PAGES = 7;

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
 * weekday block (Work or School, the only thing that differs by `kind`) and
 * Sunday church. Left with no `recurringUntil`, unlike a user-drawn recurring
 * event, which always gets an end date from the edit form, since this is a
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

function buildStarterSchedule(entries: StarterEntry[], eventTypeColors: Record<string, string>): Omit<CalendarEvent, 'id'>[] {
  const anchor = format(new Date(), 'yyyy-MM-dd');
  return entries.map(entry => ({
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

export function OnboardingScreen({ visible, onDismiss, onFinished }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { toggleDailyReview, toggleEventReminders } = useNotificationToggles();
  const { definitions, updateDefinitions } = useWeeklyGoals();
  const { addEvent } = useCalendarEvents();
  const {
    definitions: eventTypeDefinitions,
    updateDefinitions: updateEventTypeDefinitions,
  } = useEventTypeDefinitions();

  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  // Every field below is a draft: nothing here writes to storage until
  // commitAndComplete() runs. Each is seeded from the live data on open (see
  // the reset effect) rather than starting from a hardcoded default, so
  // replaying onboarding on an account that already has real settings shows
  // what's actually there instead of quietly reverting it.
  const [disabledTypeIds, setDisabledTypeIds] = useState<Set<string>>(new Set());
  const [removedGoalIds, setRemovedGoalIds] = useState<Set<string>>(new Set());
  // null means "leave built-in colors as they already are" — only set once the
  // user actually taps a chip, so replaying onboarding never clobbers colors
  // someone already customized just because a page was scrolled past.
  const [eventColorSchemeId, setEventColorSchemeId] = useState<string | null>(null);
  const [goalColorSchemeId, setGoalColorSchemeId] = useState<string | null>(null);
  const [wantsSchedule, setWantsSchedule] = useState(true);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('work');
  const [draftDailyReview, setDraftDailyReview] = useState(false);
  const [draftEventReminders, setDraftEventReminders] = useState(false);
  const [draftTheme, setDraftTheme] = useState<AppSettings['theme']>('system');
  const [draftWeekStart, setDraftWeekStart] = useState<AppSettings['weekStart']>('sunday');

  const [showImport, setShowImport] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Kept mounted only while visible, the cheapest way to guarantee a replay
  // from Settings always starts on page one instead of resuming wherever a
  // prior pass through this flow left off.
  useEffect(() => {
    if (visible) {
      setPage(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });

      const activeTypeIds = new Set(eventTypeDefinitions.map(d => d.id));
      setDisabledTypeIds(new Set(DEFAULT_EVENT_TYPES.filter(d => !activeTypeIds.has(d.id)).map(d => d.id)));

      const activeGoalIds = new Set(definitions.map(d => d.id));
      setRemovedGoalIds(new Set(DEFAULT_GOALS.filter(d => !activeGoalIds.has(d.id)).map(d => d.id)));

      const resolvedEventColors = Object.fromEntries(
        DEFAULT_EVENT_TYPES.map(d => [d.id, eventTypeColor(d.id, settings.eventTypeColors)]),
      );
      setEventColorSchemeId(matchEventColorScheme(resolvedEventColors));

      const resolvedGoalColors = Object.fromEntries(
        DEFAULT_GOALS.map(d => [d.id, definitions.find(x => x.id === d.id)?.color ?? d.color]),
      );
      setGoalColorSchemeId(matchGoalColorScheme(resolvedGoalColors));

      setWantsSchedule(true);
      setScheduleKind('work');

      setDraftDailyReview(settings.dailyReviewEnabled);
      setDraftEventReminders(settings.eventReminderEnabled);
      setDraftTheme(settings.theme);
      setDraftWeekStart(settings.weekStart);

      setShowImport(false);
      setCompleting(false);
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

  function toggleEventType(id: string) {
    setDisabledTypeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGoal(id: string) {
    setRemovedGoalIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Previews the chosen scheme in the lists below each picker without
  // touching settings/definitions until commitAndComplete — same draft
  // pattern as every other choice on this screen.
  function draftEventColor(id: string): string {
    const scheme = EVENT_COLOR_SCHEMES.find(s => s.id === eventColorSchemeId);
    return scheme?.colors[id] ?? eventTypeColor(id, settings.eventTypeColors);
  }

  function draftGoalColor(id: string, fallback: string): string {
    const scheme = GOAL_COLOR_SCHEMES.find(s => s.id === goalColorSchemeId);
    return scheme?.colors[id] ?? fallback;
  }

  /**
   * Applies every draft choice in one pass. onDismiss() fires first and
   * synchronously, so the modal closes onto Home immediately rather than
   * leaving the user staring at a disabled button for however long the
   * writes below take, up to nine sequential addEvent calls among them. Home
   * shows a skeleton in the meantime (see useOnboardingFinishing()) and
   * onFinished() clears it once everything below has actually landed, in a
   * `finally` so a mid-sequence failure can't leave it stuck.
   *
   * Built-in rows are rewritten from the live, already-merged definitions
   * (not the bare defaults) so a switch left untouched carries forward
   * whatever customization already existed on a replay, and only the ones
   * actually flipped off pick up `removed: true`.
   */
  async function commitAndComplete() {
    if (completing) return;
    setCompleting(true);
    onDismiss();

    try {
      const eventScheme = EVENT_COLOR_SCHEMES.find(s => s.id === eventColorSchemeId);
      // Merged locally rather than read back from settings after the write
      // below: updateSettings won't have re-rendered this closure yet, and
      // the starter schedule needs the chosen colors immediately, not after
      // a round trip.
      const effectiveEventTypeColors = eventScheme
        ? { ...settings.eventTypeColors, ...eventScheme.colors }
        : settings.eventTypeColors;

      const goalScheme = GOAL_COLOR_SCHEMES.find(s => s.id === goalColorSchemeId);

      const typeCustoms = eventTypeDefinitions.filter(d => !d.builtIn);
      const typeBuiltIns = DEFAULT_EVENT_TYPES.map(defaultDef => {
        const live = eventTypeDefinitions.find(d => d.id === defaultDef.id) ?? defaultDef;
        return disabledTypeIds.has(defaultDef.id) ? { ...live, removed: true } : live;
      });
      await updateEventTypeDefinitions([...typeBuiltIns, ...typeCustoms]);

      const goalCustoms = definitions.filter(d => !d.builtIn);
      const goalBuiltIns = DEFAULT_GOALS.map(defaultDef => {
        const live = definitions.find(d => d.id === defaultDef.id) ?? defaultDef;
        const withColor = goalScheme?.colors[defaultDef.id]
          ? { ...live, color: goalScheme.colors[defaultDef.id] }
          : live;
        return removedGoalIds.has(defaultDef.id) ? { ...withColor, removed: true } : withColor;
      });
      await updateDefinitions([...goalBuiltIns, ...goalCustoms]);

      if (wantsSchedule) {
        const activeTypeIds = new Set(DEFAULT_EVENT_TYPES.filter(d => !disabledTypeIds.has(d.id)).map(d => d.id));
        const entries = starterEntries(scheduleKind).filter(e => activeTypeIds.has(e.type));
        for (const draft of buildStarterSchedule(entries, effectiveEventTypeColors)) {
          await addEvent(draft);
        }
      }

      await toggleDailyReview(draftDailyReview);
      await toggleEventReminders(draftEventReminders);
      await updateSettings({
        theme: draftTheme,
        weekStart: draftWeekStart,
        ...(eventScheme ? { eventTypeColors: effectiveEventTypeColors } : {}),
      });
    } finally {
      onFinished();
    }
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        {!isLast && (
          <TouchableOpacity style={[styles.skip, { top: insets.top + 12 }]} onPress={commitAndComplete} hitSlop={12}>
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

          {/* Event Types */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="list" size={48} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Choose your event types</Text>
            <Text style={styles.body}>
              Select the types of events you would like to use in the Calendar page. Each event may
              also be linked to a goal, so completing that kind of event updates the goal
              automatically.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.schemeRow}
              contentContainerStyle={styles.schemeRowContent}
            >
              {EVENT_COLOR_SCHEMES.map(scheme => {
                const active = eventColorSchemeId === scheme.id;
                return (
                  <TouchableOpacity
                    key={scheme.id}
                    style={[styles.schemeChip, active && styles.schemeChipActive]}
                    onPress={() => setEventColorSchemeId(scheme.id)}
                  >
                    <View style={styles.schemeDots}>
                      {schemePreviewColors(scheme.colors).map((c, i) => (
                        <View key={i} style={[styles.schemeDot, { backgroundColor: c }]} />
                      ))}
                    </View>
                    <Text style={[styles.schemeChipText, active && styles.schemeChipTextActive]}>{scheme.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.card}>
              {DEFAULT_EVENT_TYPES.map((def, i, arr) => {
                const color = draftEventColor(def.id);
                return (
                  <View key={def.id} style={[styles.goalRow, i === arr.length - 1 && styles.rowLast]}>
                    <View style={[styles.typeDot, { backgroundColor: color }]} />
                    <Text style={styles.goalLabel}>{def.label}</Text>
                    <Switch
                      value={!disabledTypeIds.has(def.id)}
                      onValueChange={() => toggleEventType(def.id)}
                      trackColor={{ true: Colors.control }}
                      thumbColor={Colors.white}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={styles.footnote}>
              Add, remove, or link event types to a goal anytime from Settings → Event Types.
            </Text>
          </ScrollView>

          {/* Home, weekly goals */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="home" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Home: your weekly goals</Text>
            <Text style={styles.body}>
              Select the goals you would like to track. View and personalize your weekly and
              monthly goals from the Home page. Progress graphs can be seen and future goals can
              be set from there as well.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.schemeRow}
              contentContainerStyle={styles.schemeRowContent}
            >
              {GOAL_COLOR_SCHEMES.map(scheme => {
                const active = goalColorSchemeId === scheme.id;
                return (
                  <TouchableOpacity
                    key={scheme.id}
                    style={[styles.schemeChip, active && styles.schemeChipActive]}
                    onPress={() => setGoalColorSchemeId(scheme.id)}
                  >
                    <View style={styles.schemeDots}>
                      {schemePreviewColors(scheme.colors).map((c, i) => (
                        <View key={i} style={[styles.schemeDot, { backgroundColor: c }]} />
                      ))}
                    </View>
                    <Text style={[styles.schemeChipText, active && styles.schemeChipTextActive]}>{scheme.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.card}>
              {DEFAULT_GOALS.map((def, i, arr) => {
                const color = draftGoalColor(def.id, def.color);
                return (
                  <View key={def.id} style={[styles.goalRow, i === arr.length - 1 && styles.rowLast]}>
                    <View style={[styles.goalIconWrap, { backgroundColor: isDark ? color : color + '20' }]}>
                      <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={16} color={isDark ? lightenColor(color) : color} />
                    </View>
                    <Text style={styles.goalLabel}>{def.label}</Text>
                    <Switch
                      value={!removedGoalIds.has(def.id)}
                      onValueChange={() => toggleGoal(def.id)}
                      trackColor={{ true: Colors.control }}
                      thumbColor={Colors.white}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={styles.footnote}>
              Add, remove, or link goals to an event type anytime from Home → Edit Goals.
            </Text>
          </ScrollView>

          {/* Calendar, starter schedule */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Calendar: log your days</Text>
            <Text style={styles.body}>
              Enjoy the familiar feel of scheduling out and reporting on your days on the
              Calendar page. You can start with a ready-made schedule below, or build your own
              from scratch.
            </Text>
            <View style={styles.card}>
              <View style={[styles.toggleRow, !wantsSchedule && styles.rowLast]}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Starter Schedule</Text>
                  <Text style={styles.toggleHint}>Prayer, study, meals, exercise, and Sunday church, repeating.</Text>
                </View>
                <Switch
                  value={wantsSchedule}
                  onValueChange={setWantsSchedule}
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
                      onPress={() => setScheduleKind(kind)}
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
                Add, edit, delete, and report events anytime from the Calendar page.
              </Text>
            )}
          </ScrollView>

          {/* People, import contacts */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>People: those who matter most</Text>
            <Text style={styles.body}>
              Save contact info and track everything from potential dates to recent converts and
              their progress on the covenant path. View someone's timeline to see what
              events they've been a part of.
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
            <Text style={styles.footnote}>
              You can also add, edit, or remove people manually at any time.
            </Text>
          </ScrollView>

          {/* Settings, notifications and a couple of preferences */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="settings" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>Settings: make it yours</Text>
            <Text style={styles.body}>
              Choose your preferences now, or leave the defaults. Everything here and more can be
              personalized anytime from the Settings page.
            </Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Daily Review</Text>
                  <Text style={styles.toggleHint}>A nightly nudge to report today's events.</Text>
                </View>
                <Switch
                  value={draftDailyReview}
                  onValueChange={setDraftDailyReview}
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
                  value={draftEventReminders}
                  onValueChange={setDraftEventReminders}
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
                      style={[styles.pillSmall, draftTheme === theme && styles.pillActive]}
                      onPress={() => setDraftTheme(theme)}
                    >
                      <Text style={[styles.pillTextSmall, draftTheme === theme && styles.pillTextActive]}>
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
                      style={[styles.pillSmall, draftWeekStart === day && styles.pillActive]}
                      onPress={() => setDraftWeekStart(day)}
                    >
                      <Text style={[styles.pillTextSmall, draftWeekStart === day && styles.pillTextActive]}>
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
            <Text style={styles.scriptureRef}>James 1:22</Text>
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
              onPress={() => (isLast ? commitAndComplete() : goTo(page + 1))}
              disabled={completing}
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
    // Filled with the same colour as the app's cards, so a card or line of body
    // text scrolling underneath (each page scrolls on its own, independent of
    // this fixed corner) gets cleanly covered instead of showing through and
    // overlapping the label.
    skip: {
      position: 'absolute',
      right: 16,
      zIndex: 1,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
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
    // Event types get a flat color swatch rather than an icon-on-tint disc,
    // since a type has no icon of its own elsewhere in the app either.
    typeDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      marginRight: 12,
    },
    goalLabel: { flex: 1, fontSize: 14, color: C.text },
    schemeRow: { width: '100%', flexGrow: 0, marginTop: 24 },
    schemeRowContent: { gap: 10, paddingHorizontal: 2 },
    schemeChip: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: C.contactActionBg,
    },
    schemeChipActive: { backgroundColor: C.control },
    schemeDots: { flexDirection: 'row' },
    schemeDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      marginHorizontal: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    schemeChipText: { fontSize: 12, fontWeight: '600', color: C.textSecondary, marginTop: 6 },
    schemeChipTextActive: { color: C.white },
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
