export function lightenColor(hex: string, amount = 0.80): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

/** Mixes `hex` toward black by `amount` — the dark-mode counterpart to
 * `lightenColor`, for fills that need to read as tinted-but-dim rather than
 * washed-out-pale against a dark background. */
export function darkenColor(hex: string, amount = 0.55): string {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr}, ${dg}, ${db})`;
}

export interface HSV {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * `#rgb` and a missing `#` both become `#rrggbb`; anything else is null, so a
 * value that reached storage before this picker existed can't crash the maths.
 */
export function normalizeHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (withHash.length === 4 && /^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return HEX6.test(withHash) ? withHash.toUpperCase() : null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(safe.slice(1, 3), 16),
    g: parseInt(safe.slice(3, 5), 16),
    b: parseInt(safe.slice(5, 7), 16),
  };
}

function channel(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hexToHsv(hex: string): HSV {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d + 6) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** The fully saturated, fully bright form of a hue — what the strips ramp through. */
export function hueHex(h: number): string {
  return hsvToHex(h, 1, 1);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Ink that stays legible on `hex`. The app's headers are a user-chosen colour
 * now, so white lettering can no longer be assumed — a pale yellow header needs
 * dark text. 0.45 is where white text drops below ~4.5:1 against the background.
 */
export function contrastInk(hex: string): string {
  return luminance(hex) > 0.45 ? '#1A1A1A' : '#FFFFFF';
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
