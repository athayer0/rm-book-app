import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutChangeEvent, Pressable,
} from 'react-native';
import { Svg, Rect, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useIsDark } from '../hooks/useIsDark';
import { lightenColor } from '../utils/colorUtils';
import type { ColorPalette } from '../constants/colors';
import { GoalDefinition } from '../constants/defaultGoals';
import { GoalIcon } from './GoalIcon';
import { DropdownMenu, DropdownItem } from './DropdownMenu';
import { useWeeklyGoals, resolveGoal } from '../hooks/useWeeklyGoals';
import { getWeekKeyByOffset, formatWeekLabel } from '../utils/dateUtils';

interface WeekPoint {
  weekKey: string;
  actual: number;
  goal: number;
}

interface Props {
  definitions: GoalDefinition[];
}

const LEFT_PAD = 32;
const RIGHT_PAD = 8;
const TOP_PAD = 22;
// Room for the single x-axis label; was 44 when each column carried two lines.
// Only feeds svgH — the labels sit at a fixed offset from the top of the plot,
// so trimming this raises the bottom of the card without moving anything in it.
// The label baseline is at +22, so anything under ~26 starts clipping descenders.
const BOTTOM_PAD = 27;
const CHART_H = 180;
const N_WEEKS = 6;
// Ten lines over CHART_H is ~18px apart, tight but legible at fontSize 9 — and
// it's what keeps a max of 10 or under labelled by ones.
const MAX_GRID_LINES = 10;

// Walks a 1–2–5–10 sequence and takes the first step that fits the axis inside
// MAX_GRID_LINES: ones up to 10, twos to 20, fives to 50, and so on. Taking
// fractions of the max instead is what used to skip labels — a quarter of 5
// rounds to 1 and half rounds to 3, so 2 never gets a line.
function tickStep(max: number): number {
  for (let pow = 0; pow < 12; pow++) {
    for (const m of [1, 2, 5]) {
      const step = m * 10 ** pow;
      if (max / step <= MAX_GRID_LINES) return step;
    }
  }
  return 10 ** 12;
}

export function GoalGraphTab({ definitions }: Props) {
  const Colors = useColors();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const { getWeekData } = useWeeklyGoals();
  const visibleDefs = definitions.filter(d => d.visible);

  const [selectedId, setSelectedId] = useState<string>(visibleDefs[0]?.id ?? '');
  const [weekData, setWeekData] = useState<WeekPoint[]>([]);
  const [nextWeek, setNextWeek] = useState<{ actual: number; goal: number | null }>({ actual: 0, goal: null });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const selectedDef = visibleDefs.find(d => d.id === selectedId) ?? visibleDefs[0];

  const loadData = useCallback(async (id: string) => {
    if (!id) return;
    const def = definitions.find(d => d.id === id);
    if (!def) return;

    const points: WeekPoint[] = [];
    for (let offset = -(N_WEEKS - 1); offset <= 0; offset++) {
      const wk = getWeekKeyByOffset(offset);
      const { counts, goals } = await getWeekData(wk);
      points.push({
        weekKey: wk,
        actual: counts[id] ?? 0,
        // Never future, so this always resolves to a number the bar maths can use.
        goal: resolveGoal(goals[id], false) ?? 0,
      });
    }
    setWeekData(points);

    const nextWk = getWeekKeyByOffset(1);
    const { counts: nc, goals: ng } = await getWeekData(nextWk);
    setNextWeek({ actual: nc[id] ?? 0, goal: resolveGoal(ng[id], true) });
  }, [definitions, getWeekData]);

  useEffect(() => {
    if (selectedId) loadData(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const first = visibleDefs[0]?.id;
    if (!selectedId && first) setSelectedId(first);
    else if (selectedId) loadData(selectedId);
  }, [definitions]);

  const svgW = containerWidth;
  const svgH = TOP_PAD + CHART_H + BOTTOM_PAD;
  const drawW = svgW - LEFT_PAD - RIGHT_PAD;
  const colW = drawW / N_WEEKS;
  const barW = colW * 0.5;

  const rawMax = weekData.length
    ? Math.max(...weekData.map(p => p.goal), ...weekData.map(p => p.actual), 1)
    : 1;
  const maxVal = rawMax * 1.2;

  function yFor(v: number) {
    return TOP_PAD + CHART_H - (v / maxVal) * CHART_H;
  }
  function barX(i: number) { return LEFT_PAD + i * colW + (colW - barW) / 2; }
  function dotX(i: number) { return LEFT_PAD + i * colW + colW / 2; }

  const step = tickStep(rawMax);
  const gridLevels: number[] = [];
  for (let v = step; v <= rawMax; v += step) gridLevels.push(v);

  const linePoints = weekData
    .map((p, i) => `${dotX(i)},${yFor(p.actual)}`)
    .join(' ');

  // The axis only needs to say which week a column is, so it carries the start
  // date alone — formatWeekLabel's full "MMM d – MMM d" range is more than six
  // columns have room for.
  function xLabel(wk: string): string {
    return formatWeekLabel(wk).split(' – ')[0] ?? '';
  }

  const lastWeek = weekData[N_WEEKS - 2] ?? { actual: 0, goal: 0 };
  const thisWeek = weekData[N_WEEKS - 1] ?? { actual: 0, goal: 0 };

  const goalBarFill = Colors.border;

  return (
    <View style={styles.container}>
      <View style={styles.dropdownWrapper}>
        {/* Trigger and menu share a wrapper so the menu hangs off the button
            itself rather than the wrapper's padding box — same construction as
            the pickers in the event and person forms. */}
        <View>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setDropdownOpen(o => !o)}
            activeOpacity={0.8}
          >
            {selectedDef && (
              <View style={[styles.dropIconBadge, { backgroundColor: isDark ? selectedDef.color : selectedDef.color + '20' }]}>
                <GoalIcon icon={selectedDef.icon} iconFamily={selectedDef.iconFamily} size={16} color={isDark ? lightenColor(selectedDef.color) : selectedDef.color} />
              </View>
            )}
            <Text style={styles.dropLabel} numberOfLines={1}>
              {selectedDef?.label ?? 'Select goal'}
            </Text>
            <Ionicons
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>

          <DropdownMenu open={dropdownOpen}>
            {visibleDefs.map((def, i) => (
              <DropdownItem
                key={def.id}
                label={def.label}
                selected={def.id === selectedId}
                showSeparator={i < visibleDefs.length - 1}
                leading={
                  // marginRight rather than the trigger's `gap`, which a menu row
                  // has no equivalent of — DropdownItem lays leading and label out
                  // adjacently and lets the leading element own its own spacing.
                  <View style={[styles.dropIconBadge, { backgroundColor: isDark ? def.color : def.color + '20', marginRight: 10 }]}>
                    <GoalIcon icon={def.icon} iconFamily={def.iconFamily} size={15} color={isDark ? lightenColor(def.color) : def.color} />
                  </View>
                }
                onPress={() => { setSelectedId(def.id); setDropdownOpen(false); }}
              />
            ))}
          </DropdownMenu>
        </View>
      </View>

      {/* Dismisses the menu on a tap anywhere else in the tab. Sits under
          dropdownWrapper's own zIndex, so the trigger stays reachable and one
          tap still closes the menu by re-tapping it rather than being eaten. */}
      {dropdownOpen && (
        <Pressable style={styles.dropdownBackdrop} onPress={() => setDropdownOpen(false)} />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {selectedDef && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Last week</Text>
              <Text style={styles.summaryValue}>
                <Text style={{ color: selectedDef.color }}>{lastWeek.actual}</Text>
                <Text style={styles.summaryGoalText}>/{lastWeek.goal}</Text>
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>This week</Text>
              <Text style={styles.summaryValue}>
                <Text style={{ color: selectedDef.color }}>{thisWeek.actual}</Text>
                <Text style={styles.summaryGoalText}>/{thisWeek.goal}</Text>
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Next week</Text>
              <Text style={styles.summaryValue}>
                <Text style={{ color: Colors.textLight }}>{nextWeek.actual}</Text>
                <Text style={styles.summaryGoalText}>/{nextWeek.goal ?? '—'}</Text>
              </Text>
            </View>
          </View>
        )}

        <View
          style={styles.chartContainer}
          onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {containerWidth > 0 && weekData.length === N_WEEKS && selectedDef && (
            <Svg width={svgW} height={svgH}>
              {gridLevels.map((val, gi) => {
                const y = yFor(val);
                return (
                  <React.Fragment key={gi}>
                    <Line
                      x1={LEFT_PAD}
                      y1={y}
                      x2={svgW - RIGHT_PAD}
                      y2={y}
                      stroke={Colors.border}
                      strokeWidth={1}
                      strokeDasharray="3,3"
                    />
                    <SvgText
                      x={LEFT_PAD - 4}
                      y={y + 4}
                      fontSize={9}
                      fill={Colors.textLight}
                      textAnchor="end"
                    >
                      {val}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {weekData.map((p, i) => {
                const bh = (p.goal / maxVal) * CHART_H;
                const by = TOP_PAD + CHART_H - bh;
                return (
                  <Rect
                    key={`bar-${i}`}
                    x={barX(i)}
                    y={by}
                    width={barW}
                    height={bh}
                    fill={goalBarFill}
                    rx={3}
                  />
                );
              })}

              {weekData.length > 1 && (
                <Polyline
                  points={linePoints}
                  fill="none"
                  stroke={selectedDef.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              )}

              {weekData.map((p, i) => {
                const cy = yFor(p.actual);
                const cx = dotX(i);
                return (
                  <React.Fragment key={`dot-${i}`}>
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={Colors.card}
                      stroke={selectedDef.color}
                      strokeWidth={2}
                    />
                    <SvgText
                      x={cx}
                      y={cy - 10}
                      fontSize={10}
                      fill={selectedDef.color}
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {p.actual}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {weekData.map((p, i) => (
                <SvgText
                  key={`xlabel-${i}`}
                  x={dotX(i)}
                  y={TOP_PAD + CHART_H + 22}
                  fontSize={9}
                  fill={Colors.textSecondary}
                  textAnchor="middle"
                >
                  {xLabel(p.weekKey)}
                </SvgText>
              ))}
            </Svg>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    dropdownWrapper: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      zIndex: 10,
    },
    // Covers the whole tab, chart included; the wrapper above outranks it, so
    // the trigger and the open menu are the only things it doesn't cover.
    dropdownBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    dropdownBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    dropIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: C.text,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
    summaryRow: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: 20,
      marginBottom: 16,
      paddingVertical: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    summaryCol: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginVertical: 4,
    },
    summaryLabel: {
      fontSize: 11,
      color: C.textLight,
      fontWeight: '500',
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: '700',
    },
    summaryGoalText: {
      fontSize: 20,
      color: C.textSecondary,
      fontWeight: '700',
    },
    chartContainer: {
      backgroundColor: C.card,
      borderRadius: 20,
      padding: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
  });
}
