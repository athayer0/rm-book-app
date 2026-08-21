import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '../hooks/useColors';
import { useTrackDrag } from '../hooks/useTrackDrag';
import { BottomSheet } from './BottomSheet';
import type { ColorPalette } from '../constants/colors';
import {
  contrastInk, hexToHsv, hsvToHex, hueHex, normalizeHex, type HSV,
} from '../utils/colorUtils';

/**
 * The colour picker for the whole app: a bottom sheet over half the screen with
 * two ways to land on the same value — a grid of ready-made swatches, and a
 * saturation/brightness field under a hue ramp. Replaces the inline strips that
 * used to expand inside a row and shove everything under them down the screen.
 *
 * The draft is committed on Done and thrown away on Cancel, so the caller sees
 * one write per visit rather than one per drag — and a colour that drives the
 * whole theme can be explored without every intermediate value being persisted
 * and synced.
 *
 * Being a `Modal` (via BottomSheet), only open this from a screen at most one
 * Modal deep — a `SheetModal` list, or a tab screen. Opened from inside another
 * BottomSheet it would be the third stacked native Modal, and iOS won't
 * reliably present that: it used to read as "tapping Color does nothing and the
 * app is stuck". Somewhere that needs a picker three deep should render
 * `ColorPickerBody` as a step inside the sheet it already has instead.
 */

type Tab = 'grid' | 'spectrum';

const TABS: Tab[] = ['grid', 'spectrum'];

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

/**
 * One grid, no headings: nine hue columns plus a tenth greyscale column, over
 * nine rows of shade. Rows are spelled out as explicit arrays rather than one
 * wrapped list — wrapping is what used to skew the spectrum into diagonals, by
 * pushing the last cell of a too-wide row onto the next line and shifting every
 * row below it a column further along.
 *
 * The greys are a column rather than a separate block because they belong on the
 * same axis: every row is a lightness level, so row 1 is the palest tint of each
 * hue *and* white, and row 9 is the deepest shade of each hue *and* black. Read
 * down any column — coloured or grey — and it is the same thing getting darker.
 */
const GRID_HUES = [0, 25, 45, 90, 145, 190, 220, 265, 310];
const GRID_COLS = GRID_HUES.length + 1;

// Four tints, the pure hue, then four shades. Nine rows against ten columns is
// what makes the cells come out square in a panel this shape.
const GRID_SHADES: { s: number; v: number }[] = [
  { s: 0.2, v: 1 },
  { s: 0.4, v: 1 },
  { s: 0.6, v: 1 },
  { s: 0.8, v: 1 },
  { s: 1, v: 1 },
  { s: 1, v: 0.82 },
  { s: 1, v: 0.64 },
  { s: 1, v: 0.46 },
  { s: 1, v: 0.28 },
];

const GRID_ROWS = GRID_SHADES.map(({ s, v }, i) => [
  ...GRID_HUES.map(h => hsvToHex(h, s, v)),
  // The grey column runs white to black across the same nine rows, so it stays
  // in step with the tint-to-shade ramp beside it.
  hsvToHex(0, 0, 1 - i / (GRID_SHADES.length - 1)),
]);

interface Props {
  visible: boolean;
  /** The colour the sheet opens on, and what Cancel restores. */
  color: string;
  /** Names what is being coloured — the event type, the goal, the theme slot. */
  title?: string;
  /** Supplied only where there is a stock value to go back to; shows Reset. */
  defaultColor?: string;
  onCancel: () => void;
  onDone: (hex: string) => void;
}

/** `useColors()` + this file's styles, in one call — shared by the sheet below and the embedded picker. */
export function useColorPickerStyles() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return { Colors, styles };
}

export function ColorPickerSheet({ visible, color, title, defaultColor, onCancel, onDone }: Props) {
  const { Colors, styles } = useColorPickerStyles();
  const { height } = useWindowDimensions();
  const { t } = useTranslation();

  // A solid half of the screen, with a floor so a small device still gets a
  // usable field rather than a squashed one.
  const sheetHeight = Math.max(400, Math.round(height * 0.55));

  // HSV rather than the hex prop is what the panels drag: hex forgets the hue at
  // pure black and white, so dragging the brightness to zero and back up would
  // come back on red instead of the hue you started on.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(normalizeHex(color) ?? '#000000'));
  const [tab, setTab] = useState<Tab>('grid');
  // What Cancel means, frozen at open time — the prop can change underneath a
  // sheet whose caller re-renders, and the before/after swatch has to keep
  // showing where this visit started.
  const [opened, setOpened] = useState(() => normalizeHex(color) ?? '#000000');

  const draft = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    if (!visible) return;
    const start = normalizeHex(color) ?? '#000000';
    setOpened(start);
    setHsv(hexToHsv(start));
    setTab('grid');
  }, [visible]);

  function pick(hex: string) {
    Haptics.selectionAsync();
    setHsv(hexToHsv(hex));
  }

  return (
    <BottomSheet
      visible={visible}
      title={title ?? t('colorPicker.colorTitle')}
      height={sheetHeight}
      onCancel={onCancel}
      onDone={() => onDone(draft)}
    >
      <ColorPickerBody
        styles={styles}
        Colors={Colors}
        hsv={hsv}
        draft={draft}
        opened={opened}
        defaultColor={defaultColor}
        tab={tab}
        onPick={pick}
        onChangeHsv={setHsv}
        onTabChange={setTab}
      />
    </BottomSheet>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/**
 * The picker itself — preview swatches, tabs, grid and spectrum — with no
 * opinion on what wraps it. `ColorPickerSheet` puts it in a BottomSheet; it is
 * exported for anything that wants to present it some other way. Fully
 * controlled, so the caller's state drives it.
 */
export function ColorPickerBody({
  styles, Colors, hsv, draft, opened, defaultColor, tab,
  onPick, onChangeHsv, onTabChange,
}: {
  styles: Styles;
  Colors: ColorPalette;
  hsv: HSV;
  draft: string;
  opened: string;
  defaultColor?: string;
  tab: Tab;
  onPick: (hex: string) => void;
  onChangeHsv: (next: HSV) => void;
  onTabChange: (t: Tab) => void;
}) {
  const { t } = useTranslation();
  const showReset = !!defaultColor && normalizeHex(defaultColor) !== draft;

  return (
    <>
      {/* Where this visit started and where it stands, unlabelled — two swatches
          either side of an arrow say "from, to" without needing to be told.
          Everything sits on one line, so the row centres between the header and
          the tabs rather than hanging captions below its own baseline.

          The default only appears once the colour is actually off it: with
          nothing to undo it was just a dimmed circle taking up the right-hand
          end of the row. It keeps its label because, unlike the pair, a lone
          swatch at the far end doesn't explain itself. */}
      <View style={styles.previewRow}>
        <View style={[styles.previewDot, { backgroundColor: opened }]} />
        <Ionicons name="arrow-forward" size={13} color={Colors.textLight} style={styles.previewArrow} />
        <View style={[styles.previewDot, styles.previewDotDraft, { backgroundColor: draft }]} />
        <View style={styles.previewSpacer} />
        {showReset && defaultColor && (
          <TouchableOpacity
            style={styles.defaultBtn}
            onPress={() => onPick(defaultColor)}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Ionicons name="refresh" size={14} color={Colors.text} />
            <Text style={styles.defaultLabel}>{t('colorPicker.default')}</Text>
            <View
              style={[styles.previewDot, { backgroundColor: normalizeHex(defaultColor) ?? defaultColor }]}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabBar}>
        {TABS.map(tabKey => (
          <TouchableOpacity
            key={tabKey}
            style={styles.tabBtn}
            onPress={() => onTabChange(tabKey)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabLabel, tab === tabKey && styles.tabLabelActive]}>{t(`colorPicker.tab.${tabKey}`)}</Text>
            {tab === tabKey && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Every panel stays mounted: each holds drag state and a measured box,
          and remounting one on a tab change would throw both away — the spectrum
          field would come back unmeasured for a frame. */}
      <View style={styles.panel}>
        <View style={[styles.panelPage, tab !== 'grid' && styles.panelHidden]} pointerEvents={tab === 'grid' ? 'auto' : 'none'}>
          <GridPanel styles={styles} selected={draft} onPick={onPick} />
        </View>
        <View style={[styles.panelPage, tab !== 'spectrum' && styles.panelHidden]} pointerEvents={tab === 'spectrum' ? 'auto' : 'none'}>
          <SpectrumPanel styles={styles} hsv={hsv} draft={draft} onChange={onChangeHsv} />
        </View>
      </View>
    </>
  );
}

/* ---------------------------------------------------------------- Grid tab */

function GridPanel({
  styles, selected, onPick,
}: {
  styles: Styles;
  selected: string;
  onPick: (hex: string) => void;
}) {
  // Cells are square, so one measurement decides everything: a `flex: 1` cell
  // would stretch to whatever the row left over and come out rectangular. The
  // side is whichever of the two axes runs out first, so the grid is as large as
  // it can be while still fitting the panel whole.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const size = Math.floor(
    Math.min(
      (box.w - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS,
      (box.h - GRID_GAP * (GRID_ROWS.length - 1)) / GRID_ROWS.length,
    ),
  );

  return (
    <View
      style={styles.gridWrap}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width - GRID_PAD * 2, h: height - GRID_PAD_V * 2 });
      }}
    >
      {size > 0 && (
        <View style={[styles.gridFrame, { gap: GRID_GAP }]}>
          {GRID_ROWS.map((row, r) => (
          <View key={r} style={styles.swatchRow}>
            {row.map((hex, c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.swatch,
                  { width: size, height: size, backgroundColor: hex },
                  // Drawn inside the cell — RN borders are border-box — so the
                  // selected swatch keeps its footprint and the grid does not
                  // shift by a few pixels every time the selection moves.
                  // Ink taken off the swatch itself, so the ring reads on a pale
                  // yellow as well as on a near-black.
                  selected === hex && { borderWidth: SELECTED_BORDER, borderColor: contrastInk(hex) },
                ]}
                onPress={() => onPick(hex)}
                activeOpacity={0.7}
              />
            ))}
          </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------ Spectrum tab */

function SpectrumPanel({
  styles, hsv, draft, onChange,
}: {
  styles: Styles;
  hsv: HSV;
  draft: string;
  onChange: (next: HSV) => void;
}) {
  // Gradient ids are document-global on web, so two live pickers would
  // otherwise paint each other's ramps.
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

  // The field is saturation across and brightness down, which is exactly what
  // the two overlaid gradients draw: white → hue horizontally is hsv(h, x, 1),
  // and black at opacity y over it multiplies through to hsv(h, x, 1 - y).
  const field = useTrackDrag((fx, fy) => onChange({ h: hsv.h, s: fx, v: 1 - fy }));
  const hue = useTrackDrag(fx => onChange({ ...hsv, h: fx * 360 }));

  const pure = hueHex(hsv.h);

  return (
    <View style={styles.spectrumWrap}>
      <View style={styles.field} {...field.panHandlers} onLayout={field.onLayout}>
        <View style={styles.fieldFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`sat-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor={pure} />
              </LinearGradient>
              <LinearGradient id={`val-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                <Stop offset="1" stopColor="#000000" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#sat-${uid})`} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#val-${uid})`} />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.fieldThumb,
            {
              left: insetPos(hsv.s, field.size.w, FIELD_THUMB),
              top: insetPos(1 - hsv.v, field.size.h, FIELD_THUMB),
              backgroundColor: draft,
            },
          ]}
        />
      </View>

      <View style={styles.strip} {...hue.panHandlers} onLayout={hue.onLayout}>
        <View style={styles.stripFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`hue-${uid}`} x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map((stop, i) => (
                  <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={stop} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#hue-${uid})`} />
          </Svg>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.stripThumb,
            { left: insetPos(hsv.h / 360, hue.size.w, STRIP_THUMB), backgroundColor: pure },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * A thumb's `left`/`top` is its centre, offset back by its own radius via a
 * negative margin — so ranging that centre across the full 0–100% of the
 * track lets it reach all the way to each end, and its far edge overhangs by
 * a radius past the track's own edge. Insetting the centre's *travel* by the
 * radius on each side keeps the whole circle within the track instead: once
 * the track's pixel size is known (post-layout), position in pixels rather
 * than percent, since a percentage can't express "radius plus a fraction of
 * the remainder." Before that first layout, size is 0 and this falls back to
 * the old percentage so the thumb isn't stranded at the origin for a frame.
 */
function insetPos(fraction: number, trackSize: number, thumbSize: number): number | `${number}%` {
  if (trackSize <= 0) return `${fraction * 100}%`;
  return thumbSize / 2 + fraction * (trackSize - thumbSize);
}

// Just enough for the card to show between cells — the grid should read as one
// field of colour, not as tiles.
const GRID_GAP = 1;
const GRID_PAD = 16;
const GRID_PAD_V = 10;
// Thick enough to read at a glance against a neighbouring cell of a similar tone.
const SELECTED_BORDER = 3;
// The preview row's tallest dot, and the slot every dot centres inside.
const PREVIEW_SLOT = 30;
const STRIP_HEIGHT = 24;
// Thumb sizes, hoisted out of makeStyles so the panels can also use them to
// inset a thumb's travel by its own radius — see `insetPos`.
const STRIP_THUMB = STRIP_HEIGHT + 6;
const FIELD_THUMB = 26;

function makeStyles(C: ColorPalette) {
  const stripThumb = STRIP_THUMB;
  const fieldThumb = FIELD_THUMB;
  return StyleSheet.create({
    // The sheet frame, backdrop and Cancel/title/Done header all live in
    // `BottomSheet` now — shared with `DurationSheet` so the two editors opened
    // from Settings cannot drift apart.
    //
    // One line, so plain centring works and the generous padding sits the row
    // visually between the header above and the tab bar below.
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 16,
    },
    previewDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    // The one that matters of the pair, so it carries the ring and the size.
    previewDotDraft: {
      width: PREVIEW_SLOT,
      height: PREVIEW_SLOT,
      borderRadius: PREVIEW_SLOT / 2,
      borderWidth: 2,
      borderColor: C.border,
    },
    previewArrow: { marginHorizontal: 8 },
    previewSpacer: { flex: 1 },
    // Label beside the swatch rather than beneath it: it is the only labelled
    // thing in the row, and a lone hanging caption would drag the row's height
    // down past the two dots it sits next to.
    // Tighter between the glyph and its label than between the label and the
    // swatch, so the two read as one unit with the colour trailing them.
    defaultBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    // `text`, not `control`: the swatch beside it is the affordance, and the
    // navy competed with Done in the header directly above. Follows the theme,
    // so it is near-black in light mode and near-white in dark.
    defaultLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginRight: 3 },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
    tabLabel: { fontSize: 14, fontWeight: '600', color: C.textSecondary },
    tabLabelActive: { color: C.control },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '18%',
      right: '18%',
      height: 2,
      borderRadius: 1,
      backgroundColor: C.control,
    },
    panel: { flex: 1 },
    // All three panels are laid out on top of each other and the inactive ones
    // hidden, rather than swapped in and out — see the render for why.
    panelPage: { ...StyleSheet.absoluteFillObject },
    panelHidden: { opacity: 0, zIndex: -1 },

    // Centred both ways: the cells are square, so whichever axis didn't decide
    // the size has a remainder, and splitting it evenly reads as intentional
    // where letting it all fall to one edge would not.
    gridWrap: {
      flex: 1,
      paddingHorizontal: GRID_PAD,
      paddingVertical: GRID_PAD_V,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // The grid reads as one continuous field, so the only thing marking its
    // outer edge is this hairline. Load-bearing at the top right, where a pure
    // white swatch meets a white card in light mode and would otherwise have no
    // edge at all — the swatches themselves no longer carry borders.
    gridFrame: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      overflow: 'hidden',
    },
    // No wrapping — the row holds exactly GRID_COLS fixed-size cells. Wrapping
    // is what skewed the spectrum into diagonals.
    swatchRow: { flexDirection: 'row', gap: GRID_GAP },
    // Square corners and a hairline gap: the cells butt together as one sheet of
    // colour, with the card showing through just enough to separate them.
    swatch: { borderRadius: 0 },

    spectrumWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    field: { flex: 1, marginBottom: 18, justifyContent: 'center' },
    fieldFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    fieldThumb: {
      position: 'absolute',
      width: fieldThumb,
      height: fieldThumb,
      borderRadius: fieldThumb / 2,
      marginLeft: -fieldThumb / 2,
      marginTop: -fieldThumb / 2,
      // A card-coloured ring separates the thumb from the field under it in
      // either theme; the shadow only has to lift it off a same-toned patch.
      borderWidth: 3,
      borderColor: C.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 3,
    },
    strip: {
      height: STRIP_HEIGHT,
      // Room for the thumb, which overhangs the track at both ends.
      marginHorizontal: stripThumb / 2,
      justifyContent: 'center',
    },
    stripFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: STRIP_HEIGHT / 2,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    stripThumb: {
      position: 'absolute',
      width: stripThumb,
      height: stripThumb,
      borderRadius: stripThumb / 2,
      marginLeft: -stripThumb / 2,
      borderWidth: 3,
      borderColor: C.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 3,
    },

  });
}
