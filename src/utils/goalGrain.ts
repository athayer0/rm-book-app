import {
  getWeekKeyByOffset, formatWeekLabel, getMonthKeyByOffset, formatMonthLabel,
} from './dateUtils';

/** The two grains a goal is tracked at. Both grids and both sheets are parameterised by this. */
export type GoalGrain = 'week' | 'month';

/** Both grains, in the order their tabs appear. */
export const GRAINS: GoalGrain[] = ['week', 'month'];

/** One period's stored counts and targets — useWeeklyGoals.getWeekData / useMonthlyGoals.getMonthData. */
export type PeriodDataReader = (periodKey: string) => Promise<{
  counts: Record<string, number>;
  goals: Record<string, number>;
}>;

/** Writes one goal's count or target for one period — the matching hook's saveXForY. */
export type PeriodValueWriter = (goalId: string, periodKey: string, value: number) => Promise<void>;

// How far the period nav can walk from today, both grains. Five back covers the
// six columns the graph plots; three forward is enough to set goals ahead
// without the list becoming a calendar.
export const MIN_OFFSET = -5;
export const MAX_OFFSET = 3;

/**
 * Everything that differs between the weekly and monthly views of a goal. The
 * goal list and the chart are each one component parameterised by this table
 * rather than a copy per grain — the near-identical pair they replaced had to be
 * kept in step by hand, and the axis scaling, tick walk, offset clamping and
 * edit dialog had all started to drift.
 *
 * The data accessors can't live here: they come off `useWeeklyGoals` /
 * `useMonthlyGoals`, so whichever sheet owns those hooks passes them in.
 */
export const GRAIN: Record<GoalGrain, {
  /** This grain's tab in the Goals sheet. */
  tabLabel: string;
  /** This grain's tab in the Goal Graph sheet. */
  graphTabLabel: string;
  /** Heading over this grain's grid on the Home screen. */
  gridLabel: string;
  /** Which of a goal's two independent visibility flags this grain honours. */
  visibilityKey: 'visible' | 'monthlyVisible';
  keyByOffset: (offset: number) => string;
  /** The period nav's own label — the full name, with room for it. */
  navLabel: (periodKey: string) => string;
  /** Short enough for one of six chart columns at fontSize 9; navLabel is not. */
  axisLabel: (periodKey: string) => string;
  /** Captions over the chart's three summary figures. */
  summary: { prev: string; current: string; next: string };
}> = {
  week: {
    tabLabel: 'Weekly',
    graphTabLabel: 'Last 6 Weeks',
    gridLabel: 'Weekly Goals',
    visibilityKey: 'visible',
    keyByOffset: getWeekKeyByOffset,
    navLabel: formatWeekLabel,
    // The axis only needs to say which week a column is, so it carries the start
    // date alone — formatWeekLabel's full "MMM d – MMM d" range is more than six
    // columns have room for.
    axisLabel: k => formatWeekLabel(k).split(' – ')[0] ?? '',
    summary: { prev: 'Last week', current: 'This week', next: 'Next week' },
  },
  month: {
    tabLabel: 'Monthly',
    graphTabLabel: 'Last 6 Months',
    gridLabel: 'Monthly Goals',
    visibilityKey: 'monthlyVisible',
    keyByOffset: getMonthKeyByOffset,
    navLabel: formatMonthLabel,
    // "August 2026" cut to "Aug". The year goes with it, as it does on the weekly
    // axis — six consecutive months read unambiguously across a year boundary.
    axisLabel: k => formatMonthLabel(k).slice(0, 3),
    summary: { prev: 'Last month', current: 'This month', next: 'Next month' },
  },
};
