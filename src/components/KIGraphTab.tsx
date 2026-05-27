import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutChangeEvent,
} from 'react-native';
import { Svg, Rect, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { IndicatorDefinition } from '../constants/defaultIndicators';
import { KIIcon } from './KIIcon';
import { useWeeklyIndicators } from '../hooks/useWeeklyIndicators';
import { getWeekKeyByOffset, formatWeekLabel } from '../utils/dateUtils';

interface WeekPoint {
  weekKey: string;
  actual: number;
  goal: number;
}

interface Props {
  definitions: IndicatorDefinition[];
}

// Chart padding constants
const LEFT_PAD = 32;
const RIGHT_PAD = 8;
const TOP_PAD = 22;
const BOTTOM_PAD = 44;
const CHART_H = 180;
const N_WEEKS = 6; // offsets -5 → 0

export function KIGraphTab({ definitions }: Props) {
  const { getWeekData } = useWeeklyIndicators();
  const visibleDefs = definitions.filter(d => d.visible);

  const [selectedId, setSelectedId] = useState<string>(visibleDefs[0]?.id ?? '');
  const [weekData, setWeekData] = useState<WeekPoint[]>([]);
  const [nextWeek, setNextWeek] = useState<{ actual: number; goal: number }>({ actual: 0, goal: 0 });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const selectedDef = visibleDefs.find(d => d.id === selectedId) ?? visibleDefs[0];

  // ── Load data ────────────────────────────────────────────────────────────

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
        goal: goals[id] ?? def.goal,
      });
    }
    setWeekData(points);

    // Next week (for summary only)
    const nextWk = getWeekKeyByOffset(1);
    const { counts: nc, goals: ng } = await getWeekData(nextWk);
    setNextWeek({ actual: nc[id] ?? 0, goal: ng[id] ?? def.goal });
  }, [definitions, getWeekData]);

  useEffect(() => {
    if (selectedId) loadData(selectedId);
  }, [selectedId]);

  // Reload when tab becomes active (definitions might change)
  useEffect(() => {
    const first = visibleDefs[0]?.id;
    if (!selectedId && first) setSelectedId(first);
    else if (selectedId) loadData(selectedId);
  }, [definitions]);

  // ── SVG geometry ─────────────────────────────────────────────────────────

  const svgW = containerWidth;
  const svgH = TOP_PAD + CHART_H + BOTTOM_PAD;
  const drawW = svgW - LEFT_PAD - RIGHT_PAD;
  const colW = drawW / N_WEEKS;
  const barW = colW * 0.5;

  const rawMax = weekData.length
    ? Math.max(...weekData.map(p => p.goal), ...weekData.map(p => p.actual), 1)
    : 1;
  const maxVal = rawMax * 1.2; // 20% headroom so bars don't touch the top

  function yFor(v: number) {
    return TOP_PAD + CHART_H - (v / maxVal) * CHART_H;
  }
  function barX(i: number) { return LEFT_PAD + i * colW + (colW - barW) / 2; }
  function dotX(i: number) { return LEFT_PAD + i * colW + colW / 2; }

  // Y-axis gridlines: up to 4 levels, based on rawMax so they stay inside the chart
  const gridLevels = [0.25, 0.5, 0.75, 1.0]
    .map(f => Math.round(rawMax * f))
    .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i); // remove zeros and duplicates

  // Polyline points string
  const linePoints = weekData
    .map((p, i) => `${dotX(i)},${yFor(p.actual)}`)
    .join(' ');

  // X-axis labels: split formatWeekLabel on " – "
  function xLabels(wk: string): [string, string] {
    const full = formatWeekLabel(wk); // e.g. "May 26 – Jun 1"
    const parts = full.split(' – ');
    return [parts[0] ?? '', parts[1] ?? ''];
  }

  // Summary data
  const lastWeek = weekData[N_WEEKS - 2] ?? { actual: 0, goal: 0 };
  const thisWeek = weekData[N_WEEKS - 1] ?? { actual: 0, goal: 0 };

  return (
    <View style={styles.container}>
      {/* ── Dropdown ── */}
      <View style={styles.dropdownWrapper}>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setDropdownOpen(o => !o)}
          activeOpacity={0.8}
        >
          {selectedDef && (
            <View style={[styles.dropIconBadge, { backgroundColor: selectedDef.color + '20' }]}>
              <KIIcon icon={selectedDef.icon} iconFamily={selectedDef.iconFamily} size={16} color={selectedDef.color} />
            </View>
          )}
          <Text style={styles.dropLabel} numberOfLines={1}>
            {selectedDef?.label ?? 'Select indicator'}
          </Text>
          <Ionicons
            name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {dropdownOpen && (
          <View style={styles.dropList}>
            {visibleDefs.map(def => (
              <TouchableOpacity
                key={def.id}
                style={[styles.dropItem, def.id === selectedId && styles.dropItemActive]}
                onPress={() => { setSelectedId(def.id); setDropdownOpen(false); }}
              >
                <View style={[styles.dropIconBadge, { backgroundColor: def.color + '20' }]}>
                  <KIIcon icon={def.icon} iconFamily={def.iconFamily} size={15} color={def.color} />
                </View>
                <Text style={[styles.dropItemText, def.id === selectedId && { color: Colors.primary, fontWeight: '600' }]}
                  numberOfLines={1}>
                  {def.label}
                </Text>
                {def.id === selectedId && (
                  <Ionicons name="checkmark" size={15} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Summary row ── */}
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
                <Text style={styles.summaryGoalText}>/{nextWeek.goal}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* ── Chart ── */}
        <View
          style={styles.chartContainer}
          onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {containerWidth > 0 && weekData.length === N_WEEKS && selectedDef && (
            <Svg width={svgW} height={svgH}>
              {/* Y-axis gridlines */}
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

              {/* Grey goal bars */}
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
                    fill="#E0E0E0"
                    rx={3}
                  />
                );
              })}

              {/* Connecting line */}
              {weekData.length > 1 && (
                <Polyline
                  points={linePoints}
                  fill="none"
                  stroke={selectedDef.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              )}

              {/* Dots + labels */}
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

              {/* X-axis labels */}
              {weekData.map((p, i) => {
                const [line1, line2] = xLabels(p.weekKey);
                const cx = dotX(i);
                const baseY = TOP_PAD + CHART_H + 14;
                return (
                  <React.Fragment key={`xlabel-${i}`}>
                    <SvgText x={cx} y={baseY} fontSize={9} fill={Colors.textSecondary} textAnchor="middle">
                      {line1}
                    </SvgText>
                    <SvgText x={cx} y={baseY + 13} fontSize={9} fill={Colors.textSecondary} textAnchor="middle">
                      {line2}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Dropdown
  dropdownWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    zIndex: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    color: Colors.text,
  },
  dropList: {
    position: 'absolute',
    top: 66,
    left: 16,
    right: 16,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 20,
  },
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dropItemActive: {
    backgroundColor: Colors.primary + '08',
  },
  dropItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginBottom: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryGoalText: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '700',
  },

  // Chart
  chartContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
});
