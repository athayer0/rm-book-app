import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, Image, ScrollView, TouchableOpacity, Switch,
  StyleSheet, useWindowDimensions, useColorScheme, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { format } from 'date-fns';
import { Svg, Rect, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { applyThemeColorOverrides } from '../hooks/useColors';
import { LightColors, DarkColors, type ColorPalette } from '../constants/colors';
import { DEFAULT_EVENT_TYPES } from '../constants/eventTypeDefaults';
import { DEFAULT_GOALS } from '../constants/defaultGoals';
import {
  EVENT_COLOR_SCHEMES, GOAL_COLOR_SCHEMES, SCHEME_PREVIEW_DOTS,
  matchEventColorScheme, matchGoalColorScheme,
  type EventColorScheme, type GoalColorScheme,
} from '../constants/colorSchemes';
import { THEME_COLOR_ROWS, type ThemeColorSettingKey } from '../constants/themeColorRows';
import {
  THEME_COLOR_SCHEMES, STATUS_COLOR_SCHEMES,
  matchThemeColorScheme, schemeChipDots,
  type ThemeColorScheme,
} from '../constants/themeColorSchemes';
import { useSettings, AppSettings } from '../hooks/useSettings';
import { useNotificationToggles } from '../hooks/useNotificationToggles';
import { useWeeklyGoals } from '../hooks/useWeeklyGoals';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useEventTypeDefinitions } from '../hooks/useEventTypeDefinitions';
import { CalendarEvent, RecurringRule, eventTypeColor } from '../utils/eventUtils';
import { addMinutesToTimeString, getWeekKeyByOffset } from '../utils/dateUtils';
import { lightenColor, withAlpha } from '../utils/colorUtils';
import { GRAIN } from '../utils/goalGrain';
import { GoalIcon } from '../components/GoalIcon';
import { GoalCard } from '../components/GoalCard';
import { tickStep } from '../components/GoalGraph';
import { ImportContactsModal } from '../modals/ImportContactsModal';
import { PersonCard } from '../components/PersonCard';
import { PERSON_STATUSES } from '../constants/personStatuses';
import { milestonesFor } from '../constants/covenantPath';
import { Person } from '../hooks/usePeople';

interface Props {
  visible: boolean;
  /** Hides the modal and marks onboarding done, before the commit writes below have finished. */
  onDismiss: () => void;
  /** Fires once every commit write has actually landed. */
  onFinished: () => void;
}

// Welcome, then Colors (primary/secondary/tertiary plus the three status
// colours — picking one here also seeds a matching default for the Event
// Types and Goals pages' own colour pickers below, though each can still be
// overridden independently once you get there), then Event Types (its own
// scheme picker, which both the goal list and the starter schedule below it
// read from), then two pages for Home — a preview of a goal card and its
// graph, then the goal picker with its own scheme picker too — then
// Calendar, then two pages for People — a preview of a person card
// (a recent convert) and their covenant path, then importing from contacts —
// then Settings, then a closing page. Pages are written inline below rather
// than data-driven, since several of them hold interactive state a generic
// pages array would only complicate.
//
// Nothing on any page writes to storage as it's touched. Every switch and pill
// here only edits local draft state; the whole thing is committed in one pass
// by commitAndComplete(), which runs on both "Get Started" and "Skip". That
// makes Skip a shortcut to the end rather than a cancel: whatever was already
// chosen on earlier pages still takes effect.
const TOTAL_PAGES = 10;
// Indices into the page order above — named rather than left as magic
// numbers at their one call site (the auto-scroll-into-view effect below),
// since that's the one place page order actually has to be known by number
// instead of just written inline.
const GOALS_PAGE_INDEX = 3;
const EVENT_TYPES_PAGE_INDEX = 5;

// Shared between the Theme grid's width math below and styles.page/
// schemeGridRow — kept as named constants rather than two copies of the
// same literal so the two can't quietly drift apart.
const PAGE_HORIZONTAL_PADDING = 28;
const SCHEME_GRID_GAP = 10;

// The Home preview page's graph is a static illustration, not the real
// GoalGraph (which needs a live PeriodDataReader and has nothing to read from
// before onboarding has written anything) — six made-up weeks of Personal
// Study (count/goal): 3/4, 5/5, 4/5, 5/5, 6/6, 7/7, landing on the same
// count/goal the example GoalCard above it shows. Real week keys still drive
// the axis labels, so the dates read as genuine even though the counts are
// invented. EXAMPLE_GOALS varies week to week rather than holding one flat
// target — real per-week targets do too.
const EXAMPLE_GOAL_ID = 'personal_study';
const EXAMPLE_COUNTS = [3, 5, 4, 5, 6, 7];
const EXAMPLE_GOALS = [4, 5, 5, 5, 6, 7];
const EXAMPLE_CHART_H = 140;
// Matches GoalGraph's own LEFT_PAD — needs the same room for a y-axis value label.
const EXAMPLE_LEFT_PAD = 32;
const EXAMPLE_RIGHT_PAD = 8;
const EXAMPLE_TOP_PAD = 20;
const EXAMPLE_BOTTOM_PAD = 24;

// The People preview page's example — a made-up recent convert rather than
// anything real, same spirit as EXAMPLE_GOAL_ID above. PersonCard reads
// nothing else off it, so id/createdAt are just placeholders.
const EXAMPLE_PERSON: Person = {
  id: 'example',
  name: 'John Smith',
  status: 'Recent Converts',
  gender: 'male',
  createdAt: '2024-01-01T00:00:00.000Z',
};
// The star that marks someone "Recent Converts" elsewhere in the app, reused
// here so the path preview reads as belonging to that same status — same
// choice PersonCovenantPathTab makes for the real thing.
const EXAMPLE_PATH_COLOR = PERSON_STATUSES['Recent Converts'].color;
// Fixed rather than read off EXAMPLE_PERSON.gender through milestonesFor()
// on every render — there's only ever one example person, so there's nothing
// to recompute.
const EXAMPLE_MILESTONES = milestonesFor('male');
// A couple of steps already checked, so the preview reads as an actual
// convert partway down the path rather than an empty checklist — still
// fully tappable, see toggleExampleMilestone below.
const EXAMPLE_MILESTONES_DEFAULT_COMPLETE = ['baptism', 'confirmation'];

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
function starterEntries(kind: ScheduleKind, t: TFunction): StarterEntry[] {
  const work: StarterEntry = { title: t('onboarding.starter.work'), type: 'work', startTime: '9:00 AM', minutes: 8 * 60, recurringRule: 'weekly', recurringDays: [1, 2, 3, 4, 5] };
  const school: StarterEntry = { title: t('onboarding.starter.school'), type: 'school', startTime: '8:00 AM', minutes: 7 * 60, recurringRule: 'weekly', recurringDays: [1, 2, 3, 4, 5] };

  return [
    { title: t('onboarding.starter.morningPrayer'), type: 'prayer', startTime: '6:30 AM', minutes: 15, recurringRule: 'daily' },
    { title: t('onboarding.starter.scriptureStudy'), type: 'scripture', startTime: '7:00 AM', minutes: 30, recurringRule: 'daily' },
    { title: t('onboarding.starter.breakfast'), type: 'meal', startTime: '7:30 AM', minutes: 30, recurringRule: 'daily' },
    kind === 'work' ? work : school,
    { title: t('onboarding.starter.lunch'), type: 'meal', startTime: '12:00 PM', minutes: 30, recurringRule: 'daily' },
    { title: t('onboarding.starter.exercise'), type: 'exercise', startTime: '5:30 PM', minutes: 30, recurringRule: 'daily' },
    { title: t('onboarding.starter.dinner'), type: 'meal', startTime: '6:30 PM', minutes: 30, recurringRule: 'daily' },
    { title: t('onboarding.starter.nightlyPrayer'), type: 'prayer', startTime: '10:00 PM', minutes: 15, recurringRule: 'daily' },
    { title: t('onboarding.starter.church'), type: 'church', startTime: '9:00 AM', minutes: 120, recurringRule: 'weekly', recurringDays: [0] },
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

function buildThemeColorDraft(settings: AppSettings): Record<ThemeColorSettingKey, string> {
  return Object.fromEntries(
    THEME_COLOR_ROWS.map(row => [row.settingKey, settings[row.settingKey]]),
  ) as Record<ThemeColorSettingKey, string>;
}

export function OnboardingScreen({ visible, onDismiss, onFinished }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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

  // Drives the whole onboarding flow's own light/dark look, independent of
  // useIsDark()/live settings — picking a pill on the Settings page should
  // repaint the flow immediately, not wait for commitAndComplete() to write
  // it. Declared ahead of Colors below so it's in scope there.
  const [draftTheme, setDraftTheme] = useState<AppSettings['theme']>('system');
  const systemScheme = useColorScheme();
  const isDark = draftTheme === 'dark' || (draftTheme === 'system' && systemScheme === 'dark');

  // Every field below is a draft: nothing here writes to storage until
  // commitAndComplete() runs. Each is seeded from the live data on open (see
  // the reset effect) rather than starting from a hardcoded default, so
  // replaying onboarding on an account that already has real settings shows
  // what's actually there instead of quietly reverting it.
  const [disabledTypeIds, setDisabledTypeIds] = useState<Set<string>>(new Set());
  const [removedGoalIds, setRemovedGoalIds] = useState<Set<string>>(new Set());
  // Every THEME_COLOR_ROWS setting, seeded straight from the live value (see
  // buildThemeColorDraft) and only ever overwritten wholesale by picking a
  // scheme chip below — there's no per-row editor on this page, so unlike
  // the event-type/goal drafts there's nothing to preserve by leaving this
  // null; committing the seeded value back is a no-op if nothing was picked.
  const [draftThemeColors, setDraftThemeColors] = useState<Record<ThemeColorSettingKey, string>>(() =>
    buildThemeColorDraft(settings),
  );
  // Built off the draft, not off live settings via useColors() — this is
  // what makes the whole onboarding flow (icon circles, the Next button,
  // switch tracks, the status-icon preview) repaint itself the instant a
  // colour scheme is picked, the same way ImportContactsModal's list
  // updates immediately rather than waiting for commitAndComplete.
  const Colors = useMemo(
    () => applyThemeColorOverrides(isDark ? DarkColors : LightColors, isDark, draftThemeColors),
    [isDark, draftThemeColors],
  );
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  // Which chip is highlighted in each of the three scheme pickers — derived
  // from draftThemeColors/live definitions on open/replay (see the reset
  // effect) and updated locally on tap so the chip and the preview swatches
  // change together. null means "leave built-in colors as they already
  // are" — only set once the user actually taps a chip (or a Colors chip
  // seeds a default, see selectThemeScheme), so replaying onboarding never
  // clobbers colors someone already customized just because a page was
  // scrolled past.
  //
  // Status colors aren't a picker of their own — picking a theme scheme
  // carries its same-id status scheme along (selectThemeScheme below), since
  // there's no page here to preview them against and no reason to let those
  // three disagree with the app's tint. Event and goal colors are different:
  // each has its own page with a real list of rows to preview against, so
  // each gets its own independent picker (eventColorSchemeId/
  // goalColorSchemeId below) — selectThemeScheme seeds both with its own id
  // as a starting default, but tapping a chip on the Event Types or Goals
  // page overrides only that one.
  const [themeSchemeId, setThemeSchemeId] = useState<string | null>(null);
  const [eventColorSchemeId, setEventColorSchemeId] = useState<string | null>(null);
  const [goalColorSchemeId, setGoalColorSchemeId] = useState<string | null>(null);
  // The Event Types/Goals scheme rows scroll (unlike the Colors page's fixed
  // grid), so the active chip can land off-screen — picked on Colors, or on
  // replay of an account whose scheme is the scheme list's last entry. These
  // refs plus each chip's measured x (schemeChipLayouts effect below) are
  // what bring it back into view on arrival.
  const eventSchemeRowRef = useRef<ScrollView>(null);
  const goalSchemeRowRef = useRef<ScrollView>(null);
  const [eventChipX, setEventChipX] = useState<Record<string, number>>({});
  const [goalChipX, setGoalChipX] = useState<Record<string, number>>({});
  const [wantsSchedule, setWantsSchedule] = useState(true);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('student');
  const [draftDailyReview, setDraftDailyReview] = useState(false);
  const [draftEventReminders, setDraftEventReminders] = useState(false);
  const [draftWeekStart, setDraftWeekStart] = useState<AppSettings['weekStart']>('sunday');

  const [showImport, setShowImport] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Measured via onLayout rather than derived from useWindowDimensions'
  // width, since the chart sits inside the page's own padding and the
  // example card's card padding — same approach as GoalGraph's containerWidth.
  const [exampleChartWidth, setExampleChartWidth] = useState(0);
  // The People preview page's covenant-path checklist: purely local, tappable
  // state for EXAMPLE_PERSON. Unlike every draft above, nothing here ever
  // reaches commitAndComplete() — there's no real person behind this example
  // to write progress against, so a tap only ever updates this Set.
  const [exampleCompletedMilestones, setExampleCompletedMilestones] = useState<Set<string>>(
    () => new Set(EXAMPLE_MILESTONES_DEFAULT_COMPLETE),
  );

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

      const themeColorDraft = buildThemeColorDraft(settings);
      setDraftThemeColors(themeColorDraft);
      setThemeSchemeId(matchThemeColorScheme(themeColorDraft));

      // Seeded independently from live data rather than from themeSchemeId
      // above — a replay should show whichever event/goal scheme is
      // actually active, even if it no longer matches the current theme
      // (e.g. the theme was changed from Settings without touching colors).
      const resolvedEventColors = Object.fromEntries(
        DEFAULT_EVENT_TYPES.map(d => [d.id, eventTypeColor(d.id, settings.eventTypeColors)]),
      );
      setEventColorSchemeId(matchEventColorScheme(resolvedEventColors));

      const resolvedGoalColors = Object.fromEntries(
        DEFAULT_GOALS.map(d => [d.id, definitions.find(x => x.id === d.id)?.color ?? d.color]),
      );
      setGoalColorSchemeId(matchGoalColorScheme(resolvedGoalColors));

      setWantsSchedule(true);
      setScheduleKind('student');

      setDraftDailyReview(settings.dailyReviewEnabled);
      setDraftEventReminders(settings.eventReminderEnabled);
      setDraftTheme(settings.theme);
      setDraftWeekStart(settings.weekStart);

      setShowImport(false);
      setCompleting(false);
      setExampleCompletedMilestones(new Set(EXAMPLE_MILESTONES_DEFAULT_COMPLETE));
    }
  }, [visible]);

  // Brings the active scheme chip into view whenever its page is the one on
  // screen — landing on Event Types/Goals with the scheme picked on Colors
  // (or matched from a replay) sitting off the end of the row otherwise, the
  // same way it would if the active chip changed while already on the page.
  // Waits on the chip's measured x rather than an index-times-width guess,
  // since chips size to their label/dots rather than a fixed width.
  useEffect(() => {
    if (page !== EVENT_TYPES_PAGE_INDEX || !eventColorSchemeId) return;
    const x = eventChipX[eventColorSchemeId];
    if (x === undefined) return;
    eventSchemeRowRef.current?.scrollTo({ x: Math.max(0, x - SCHEME_GRID_GAP), animated: true });
  }, [page, eventColorSchemeId, eventChipX]);

  useEffect(() => {
    if (page !== GOALS_PAGE_INDEX || !goalColorSchemeId) return;
    const x = goalChipX[goalColorSchemeId];
    if (x === undefined) return;
    goalSchemeRowRef.current?.scrollTo({ x: Math.max(0, x - SCHEME_GRID_GAP), animated: true });
  }, [page, goalColorSchemeId, goalChipX]);

  if (!visible) return null;

  const isLast = page === TOTAL_PAGES - 1;

  // Local-only toggle for the People preview page's covenant-path checklist —
  // see the note on exampleCompletedMilestones above. Never touches
  // useConvertProgress or any other real storage.
  function toggleExampleMilestone(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExampleCompletedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Carries the theme scheme's colorSchemeId-matched status scheme along, so
  // completed/failed/pending always match whichever look was just picked
  // instead of being a separate choice — see the note on themeSchemeId above.
  // Also seeds eventColorSchemeId/goalColorSchemeId to that same
  // colorSchemeId (Classic Blue and Classic Red both seed plain "classic"),
  // since Colors is the first of the three pickers a person reaches — that's
  // only a default, not a lock: selectEventScheme/selectGoalScheme below can
  // still override either one independently once its own page is reached.
  function selectThemeScheme(scheme: ThemeColorScheme) {
    setThemeSchemeId(scheme.id);
    setEventColorSchemeId(scheme.colorSchemeId);
    setGoalColorSchemeId(scheme.colorSchemeId);
    const statusScheme = STATUS_COLOR_SCHEMES.find(s => s.id === scheme.colorSchemeId);
    setDraftThemeColors(prev => ({
      ...prev,
      themeColor: scheme.themeColor,
      secondaryColorLight: scheme.secondaryColorLight,
      secondaryColorDark: scheme.secondaryColorDark,
      tertiaryColorLight: scheme.tertiaryColorLight,
      tertiaryColorDark: scheme.tertiaryColorDark,
      ...(statusScheme ? {
        statusCompletedColorLight: statusScheme.statusCompletedColorLight,
        statusCompletedColorDark: statusScheme.statusCompletedColorDark,
        statusFailedColorLight: statusScheme.statusFailedColorLight,
        statusFailedColorDark: statusScheme.statusFailedColorDark,
        statusPendingColorLight: statusScheme.statusPendingColorLight,
        statusPendingColorDark: statusScheme.statusPendingColorDark,
      } : {}),
    }));
  }

  // The Event Types and Goals pages' own pickers — independent of each
  // other and of themeSchemeId once tapped, see the note on themeSchemeId
  // above.
  function selectEventScheme(scheme: EventColorScheme) {
    setEventColorSchemeId(scheme.id);
  }

  function selectGoalScheme(scheme: GoalColorScheme) {
    setGoalColorSchemeId(scheme.id);
  }

  // The Theme picker on the Colors page: a static 3-then-2-then-1 grid
  // rather than a horizontal scroll, so this is called once per row instead
  // of once for a single ScrollView's worth of chips. Chips are sized to a
  // fixed chipWidth (one third of the row, same math for every row) instead
  // of flex:1, so the shorter rows' boxes come out the same width as the
  // three-chip first row's rather than stretching to fill — each shorter
  // row is then centered (schemeGridRowCenter) so it reads as sitting in
  // the middle of an implied three columns.
  const chipWidth = (width - PAGE_HORIZONTAL_PADDING * 2 - SCHEME_GRID_GAP * 2) / 3;

  function renderThemeChip(scheme: ThemeColorScheme) {
    const active = themeSchemeId === scheme.id;
    const dots = schemeChipDots(scheme.id, isDark);
    return (
      <TouchableOpacity
        key={scheme.id}
        style={[styles.schemeChip, { width: chipWidth }, active && styles.schemeChipActive]}
        onPress={() => selectThemeScheme(scheme)}
      >
        <View style={styles.schemeDots}>
          {dots.map((c, i) => (
            <View key={i} style={[styles.schemeDot, styles.schemeDotThemeChip, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={[styles.schemeChipText, active && styles.schemeChipTextActive]}>{t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}</Text>
      </TouchableOpacity>
    );
  }

  // The Event Types and Goals pages' pickers: a horizontal scroll rather
  // than the Colors page's fixed grid, since there's no reason to reserve a
  // full page height for them here — they sit above each page's existing
  // row list instead. Both chip renderers read the same hand-picked
  // SCHEME_PREVIEW_DOTS (sourced only from EVENT_COLOR_SCHEMES, never the
  // goal colours) rather than computing dots from whichever colour map the
  // page is otherwise about, so "Marine" looks like the same five dots
  // whether you're looking at it here or on the Goals page below.
  function renderEventSchemeChip(scheme: EventColorScheme) {
    const active = eventColorSchemeId === scheme.id;
    const dots = SCHEME_PREVIEW_DOTS[scheme.id] ?? [];
    return (
      <TouchableOpacity
        key={scheme.id}
        style={[styles.schemeChip, active && styles.schemeChipActive]}
        onPress={() => selectEventScheme(scheme)}
        onLayout={e => {
          const x = e.nativeEvent.layout.x;
          setEventChipX(prev => (prev[scheme.id] === x ? prev : { ...prev, [scheme.id]: x }));
        }}
      >
        <View style={styles.schemeDots}>
          {dots.map((c, i) => (
            <View key={i} style={[styles.schemeDot, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={[styles.schemeChipText, active && styles.schemeChipTextActive]}>{t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}</Text>
      </TouchableOpacity>
    );
  }

  function renderGoalSchemeChip(scheme: GoalColorScheme) {
    const active = goalColorSchemeId === scheme.id;
    // Same SCHEME_PREVIEW_DOTS as renderEventSchemeChip above, keyed off
    // this goal scheme's id — deliberately not derived from `scheme.colors`
    // (the goal palette), so this chip's dots match the event chip's
    // exactly rather than sampling a different eight-colour set.
    const dots = SCHEME_PREVIEW_DOTS[scheme.id] ?? [];
    return (
      <TouchableOpacity
        key={scheme.id}
        style={[styles.schemeChip, active && styles.schemeChipActive]}
        onPress={() => selectGoalScheme(scheme)}
        onLayout={e => {
          const x = e.nativeEvent.layout.x;
          setGoalChipX(prev => (prev[scheme.id] === x ? prev : { ...prev, [scheme.id]: x }));
        }}
      >
        <View style={styles.schemeDots}>
          {dots.map((c, i) => (
            <View key={i} style={[styles.schemeDot, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={[styles.schemeChipText, active && styles.schemeChipTextActive]}>{t(`colorSchemes.${scheme.id}`, { defaultValue: scheme.label })}</Text>
      </TouchableOpacity>
    );
  }

  // The Home preview page's graph, drawn with the same visual grammar as
  // GoalGraph (dashed y-axis gridlines with value labels, translucent goal
  // bars, coloured line+dots) but over EXAMPLE_COUNTS rather than a live
  // PeriodDataReader — see the note on those constants above. `color` follows
  // draftGoalColor so the preview repaints with whatever scheme is picked on
  // the Goals page (or, before that page is reached, whatever Colors seeded
  // as its default).
  function renderExampleGraph(color: string) {
    const svgW = exampleChartWidth;
    const svgH = EXAMPLE_TOP_PAD + EXAMPLE_CHART_H + EXAMPLE_BOTTOM_PAD;
    const drawW = svgW - EXAMPLE_LEFT_PAD - EXAMPLE_RIGHT_PAD;
    const n = EXAMPLE_COUNTS.length;
    const colW = drawW / n;
    const barW = colW * 0.5;
    // Same two-step scaling as GoalGraph: gridlines walk up to rawMax, then
    // the plot itself is given 20% headroom above that on top.
    const rawMax = Math.max(...EXAMPLE_COUNTS, ...EXAMPLE_GOALS, 1);
    const maxVal = rawMax * 1.2;

    function yFor(v: number) { return EXAMPLE_TOP_PAD + EXAMPLE_CHART_H - (v / maxVal) * EXAMPLE_CHART_H; }
    function dotX(i: number) { return EXAMPLE_LEFT_PAD + i * colW + colW / 2; }
    function barX(i: number) { return EXAMPLE_LEFT_PAD + i * colW + (colW - barW) / 2; }

    const step = tickStep(rawMax);
    const gridLevels: number[] = [];
    for (let v = step; v <= rawMax; v += step) gridLevels.push(v);

    function goalBarH(goal: number) { return (goal / maxVal) * EXAMPLE_CHART_H; }
    function goalBarY(goal: number) { return EXAMPLE_TOP_PAD + EXAMPLE_CHART_H - goalBarH(goal); }
    const linePoints = EXAMPLE_COUNTS.map((v, i) => `${dotX(i)},${yFor(v)}`).join(' ');

    return (
      <View
        style={styles.exampleChartContainer}
        onLayout={e => setExampleChartWidth(e.nativeEvent.layout.width)}
      >
        {svgW > 0 && (
          <Svg width={svgW} height={svgH}>
            {gridLevels.map((val, gi) => {
              const y = yFor(val);
              return (
                <React.Fragment key={gi}>
                  <Line
                    x1={EXAMPLE_LEFT_PAD}
                    y1={y}
                    x2={svgW - EXAMPLE_RIGHT_PAD}
                    y2={y}
                    stroke={Colors.border}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <SvgText x={EXAMPLE_LEFT_PAD - 4} y={y + 4} fontSize={9} fill={Colors.textLight} textAnchor="end">
                    {val}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {EXAMPLE_GOALS.map((g, i) => (
              <Rect key={`bar-${i}`} x={barX(i)} y={goalBarY(g)} width={barW} height={goalBarH(g)} fill={Colors.border} rx={3} />
            ))}
            <Polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {EXAMPLE_COUNTS.map((v, i) => {
              const cx = dotX(i);
              const cy = yFor(v);
              return (
                <React.Fragment key={`dot-${i}`}>
                  <Circle cx={cx} cy={cy} r={5} fill={Colors.card} stroke={color} strokeWidth={2} />
                  <SvgText x={cx} y={cy - 10} fontSize={10} fill={color} textAnchor="middle" fontWeight="600">{v}</SvgText>
                </React.Fragment>
              );
            })}
            {EXAMPLE_COUNTS.map((_, i) => (
              <SvgText
                key={`x-${i}`}
                x={dotX(i)}
                y={EXAMPLE_TOP_PAD + EXAMPLE_CHART_H + 20}
                fontSize={9}
                fill={Colors.textSecondary}
                textAnchor="middle"
              >
                {GRAIN.week.axisLabel(getWeekKeyByOffset(i - (EXAMPLE_COUNTS.length - 1)), settings.language)}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
    );
  }

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

  // The Home preview page's example — see the note on EXAMPLE_GOAL_ID above.
  const exampleGoalDef = DEFAULT_GOALS.find(d => d.id === EXAMPLE_GOAL_ID) ?? DEFAULT_GOALS[0];
  const exampleGoalColor = draftGoalColor(exampleGoalDef.id, exampleGoalDef.color);

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

      // Written first and awaited before anything else below: this is what
      // the header, tab bar, and Home's own useColors() read the instant
      // they mount behind the dismissing modal. Landing it last (as it used
      // to) left the header etc. showing the *previous* theme color for
      // however long the slower writes below — up to nine sequential
      // addEvent calls among them — took to land.
      await updateSettings({
        theme: draftTheme,
        weekStart: draftWeekStart,
        ...draftThemeColors,
        ...(eventScheme ? { eventTypeColors: effectiveEventTypeColors } : {}),
      });

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
        const entries = starterEntries(scheduleKind, t).filter(e => activeTypeIds.has(e.type));
        for (const draft of buildStarterSchedule(entries, effectiveEventTypeColors)) {
          await addEvent(draft);
        }
      }

      await toggleDailyReview(draftDailyReview);
      await toggleEventReminders(draftEventReminders);
    } finally {
      onFinished();
    }
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        {!isLast && (
          <TouchableOpacity style={[styles.skip, { top: insets.top + 12 }]} onPress={commitAndComplete} hitSlop={12}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
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
            <Text style={styles.title}>{t('onboarding.welcome.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.welcome.body')}
            </Text>
          </ScrollView>

          {/* Colors */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="color-palette" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.colors.title')}</Text>

            <View style={styles.schemeGrid}>
              <View style={styles.schemeGridRow}>
                {THEME_COLOR_SCHEMES.slice(0, 3).map(renderThemeChip)}
              </View>
              <View style={[styles.schemeGridRow, styles.schemeGridRowCenter]}>
                {THEME_COLOR_SCHEMES.slice(3, 5).map(renderThemeChip)}
              </View>
              <View style={[styles.schemeGridRow, styles.schemeGridRowCenter]}>
                {THEME_COLOR_SCHEMES.slice(5).map(renderThemeChip)}
              </View>
            </View>

          </ScrollView>

          {/* Home, preview of a goal card and its graph */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="home" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.home.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.home.body')}
            </Text>
            <View style={styles.exampleCardWrap}>
              <GoalCard
                definition={{ ...exampleGoalDef, color: exampleGoalColor }}
                count={EXAMPLE_COUNTS[EXAMPLE_COUNTS.length - 1]}
                goal={EXAMPLE_GOALS[EXAMPLE_GOALS.length - 1]}
              />
            </View>
            {renderExampleGraph(exampleGoalColor)}
          </ScrollView>

          {/* Home, choose which goals to track */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="trending-up" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.goals.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.goals.body')}
            </Text>
            <ScrollView
              ref={goalSchemeRowRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.schemeRow}
              contentContainerStyle={styles.schemeRowContent}
            >
              {GOAL_COLOR_SCHEMES.map(renderGoalSchemeChip)}
            </ScrollView>
            <View style={styles.card}>
              {DEFAULT_GOALS.map((def, i, arr) => {
                const color = draftGoalColor(def.id, def.color);
                return (
                  <View key={def.id} style={[styles.goalRow, i === arr.length - 1 && styles.rowLast]}>
                    <View style={[styles.goalIconWrap, { backgroundColor: isDark ? color : color + '20' }]}>
                      <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={16} color={isDark ? lightenColor(color) : color} />
                    </View>
                    <Text style={styles.goalLabel}>{t(`goals.${def.id}`, { defaultValue: def.label })}</Text>
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
          </ScrollView>

          {/* Calendar, starter schedule */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.calendar.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.calendar.body')}
            </Text>
            <View style={styles.card}>
              <View style={[styles.toggleRow, !wantsSchedule && styles.rowLast]}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>{t('onboarding.calendar.starterSchedule')}</Text>
                  <Text style={styles.toggleHint}>{t('onboarding.calendar.starterScheduleHint')}</Text>
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
                  {(['student', 'work'] as const).map(kind => (
                    <TouchableOpacity
                      key={kind}
                      style={[styles.pill, scheduleKind === kind && styles.pillActive]}
                      onPress={() => setScheduleKind(kind)}
                    >
                      <Text style={[styles.pillText, scheduleKind === kind && styles.pillTextActive]}>
                        {kind === 'work' ? t('onboarding.calendar.iWork') : t('onboarding.calendar.imAStudent')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Event Types */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="list" size={48} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.eventTypes.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.eventTypes.body')}
            </Text>
            <ScrollView
              ref={eventSchemeRowRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.schemeRow}
              contentContainerStyle={styles.schemeRowContent}
            >
              {EVENT_COLOR_SCHEMES.map(renderEventSchemeChip)}
            </ScrollView>
            <View style={styles.card}>
              {DEFAULT_EVENT_TYPES.map((def, i, arr) => {
                const color = draftEventColor(def.id);
                return (
                  <View key={def.id} style={[styles.goalRow, i === arr.length - 1 && styles.rowLast]}>
                    <View style={[styles.typeDot, { backgroundColor: color }]} />
                    <Text style={styles.goalLabel}>{t(`eventTypes.${def.id}`, { defaultValue: def.label })}</Text>
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
              {t('onboarding.eventTypes.footnote')}
            </Text>
          </ScrollView>

          {/* People, preview of a person card and their covenant path */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.people.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.people.body')}
            </Text>
            <View style={styles.card}>
              <PersonCard person={EXAMPLE_PERSON} onPress={() => {}} />
            </View>
            <View style={styles.pathSummary}>
              <View style={styles.pathProgressTrack}>
                <View
                  style={[
                    styles.pathProgressFill,
                    { width: `${(exampleCompletedMilestones.size / EXAMPLE_MILESTONES.length) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.pathProgressLabel}>
                {t('covenantPathTab.completeCount', { completed: exampleCompletedMilestones.size, total: EXAMPLE_MILESTONES.length })}
              </Text>
            </View>
            <View style={styles.card}>
              {EXAMPLE_MILESTONES.map((m, i, arr) => {
                const complete = exampleCompletedMilestones.has(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.pathRow, i === arr.length - 1 && styles.rowLast]}
                    onPress={() => toggleExampleMilestone(m.id)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: complete }}
                    accessibilityLabel={t(`covenantPath.${m.id}`, { defaultValue: m.label })}
                  >
                    <GoalIcon
                      icon={m.icon}
                      iconFamily={m.iconFamily}
                      size={18}
                      color={complete ? EXAMPLE_PATH_COLOR : Colors.textLight}
                    />
                    <Text style={[styles.pathLabel, complete && styles.pathLabelDone]}>
                      {t(`covenantPath.${m.id}`, { defaultValue: m.label })}
                    </Text>
                    <View style={[styles.pathCheckbox, complete && styles.pathCheckboxChecked]}>
                      {complete && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* People, import contacts */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="download" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.contacts.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.contacts.body')}
            </Text>
            <TouchableOpacity style={styles.importCard} onPress={() => setShowImport(true)} activeOpacity={0.8}>
              <View style={styles.importIconWrap}>
                <Ionicons name="download-outline" size={22} color={Colors.onPrimary} />
              </View>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>{t('onboarding.contacts.importFromContacts')}</Text>
                <Text style={styles.toggleHint}>{t('onboarding.contacts.importHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </TouchableOpacity>
            <Text style={styles.footnote}>
              {t('onboarding.contacts.footnote')}
            </Text>
          </ScrollView>

          {/* Settings, notifications and a couple of preferences */}
          <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.iconCircle}>
              <Ionicons name="settings" size={44} color={Colors.onPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.settings.title')}</Text>
            <Text style={styles.body}>
              {t('onboarding.settings.body')}
            </Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>{t('onboarding.settings.dailyReview')}</Text>
                  <Text style={styles.toggleHint}>{t('onboarding.settings.dailyReviewHint')}</Text>
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
                  <Text style={styles.toggleLabel}>{t('onboarding.settings.eventReminders')}</Text>
                  <Text style={styles.toggleHint}>{t('onboarding.settings.eventRemindersHint')}</Text>
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
                <Text style={styles.toggleLabel}>{t('onboarding.settings.theme')}</Text>
                <View style={styles.prefPills}>
                  {(['light', 'dark', 'system'] as const).map(theme => (
                    <TouchableOpacity
                      key={theme}
                      style={[styles.pillSmall, draftTheme === theme && styles.pillActive]}
                      onPress={() => setDraftTheme(theme)}
                    >
                      <Text style={[styles.pillTextSmall, draftTheme === theme && styles.pillTextActive]}>
                        {t(`settings.theme.${theme}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[styles.prefRow, styles.rowLast]}>
                <Text style={styles.toggleLabel}>{t('onboarding.settings.weekStart')}</Text>
                <View style={styles.prefPills}>
                  {(['sunday', 'monday'] as const).map(day => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.pillSmall, draftWeekStart === day && styles.pillActive]}
                      onPress={() => setDraftWeekStart(day)}
                    >
                      <Text style={[styles.pillTextSmall, draftWeekStart === day && styles.pillTextActive]}>
                        {t(`calendar.weekdayFull.${day}`)}
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
            <Text style={styles.title}>{t('onboarding.ready.title')}</Text>
            <Text style={styles.scripture}>
              {t('settingsScreen.scriptureQuote')}
            </Text>
            <Text style={styles.scriptureRef}>{t('onboarding.ready.scriptureRef')}</Text>
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
              <Text style={styles.nextButtonText}>{isLast ? t('onboarding.getStarted') : t('onboarding.next')}</Text>
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
      paddingHorizontal: PAGE_HORIZONTAL_PADDING,
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
    // Sized to match one cell of the real two-column GoalGrid, so the
    // preview reads as an actual card rather than a stretched full-width one.
    exampleCardWrap: {
      width: '50%',
      marginTop: 24,
    },
    exampleChartContainer: {
      width: '100%',
      backgroundColor: C.card,
      borderRadius: 20,
      padding: 8,
      marginTop: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    // The covenant-path preview's progress bar, between the person card and
    // the milestone list — same layout as PersonCovenantPathTab's own summary.
    pathSummary: {
      width: '100%',
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pathProgressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(EXAMPLE_PATH_COLOR, 0.16),
      overflow: 'hidden',
    },
    pathProgressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: EXAMPLE_PATH_COLOR,
    },
    pathProgressLabel: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
    pathRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    pathLabel: { flex: 1, fontSize: 15, color: C.text },
    pathLabelDone: { color: EXAMPLE_PATH_COLOR, fontWeight: '600' },
    pathCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pathCheckboxChecked: {
      backgroundColor: EXAMPLE_PATH_COLOR,
      borderColor: EXAMPLE_PATH_COLOR,
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
    // Only the app-theme scheme chips (renderThemeChip) want a heavier
    // border than the hairline the Event Types/Goals scheme chips share —
    // those dots are already distinguished by more of them per chip, so a
    // thicker ring here is what makes a 3-dot theme chip read as clearly
    // outlined at the same size.
    schemeDotThemeChip: { borderWidth: 1 },
    schemeChipText: { fontSize: 12, fontWeight: '600', color: C.textSecondary, marginTop: 6 },
    schemeChipTextActive: { color: C.white },
    // The Theme picker's static 3-then-2-then-1 grid, in place of a
    // horizontal scroll — there's no overflow to fade, so each row just
    // wraps evenly. Chips are a fixed width (see chipWidth in the
    // component) rather than flex:1, so the shorter rows can't stretch
    // wider than the three-chip first row; schemeGridRowCenter centers
    // each shorter row instead of letting it hug the left edge.
    schemeGrid: { width: '100%', marginTop: 24, gap: SCHEME_GRID_GAP },
    schemeGridRow: { flexDirection: 'row', gap: SCHEME_GRID_GAP },
    schemeGridRowCenter: { justifyContent: 'center' },
    // The Event Types/Goals pickers, by contrast, do scroll — they sit above
    // a page that already has its own card below, so there's no room to
    // spare for a wrapped grid the way the Colors page has.
    schemeRow: { width: '100%', flexGrow: 0, marginTop: 24 },
    schemeRowContent: { gap: 10, paddingHorizontal: 2 },
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
