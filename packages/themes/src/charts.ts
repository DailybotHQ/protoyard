import type { ThemeChartTokens, ThemePalette } from '@protoyard/core';
import { contrastRatio, parseHex } from './contrast.ts';
import { type Oklch, oklchToHex, rgbToOklch } from './oklch.ts';

/*
 * Chart palettes owned by the theme (PLAN_003 decision: chart tokens live in
 * @protoyard/themes). From a palette's chart1…chart5 this derives 8
 * categorical colors, a 9-step sequential ramp and a 9-step diverging ramp,
 * using the same rules as the charts kit's `validateChartPalette`
 * (packages/charts/src/palette): every data color reaches 3:1 on the surface
 * and the background (WCAG 1.4.11), categorical colors stay ≥ 0.08 apart in
 * OKLab and ≥ 0.04 apart under simulated protanopia and deuteranopia (and,
 * stricter than the kit, tritanopia), and
 * ramps change lightness monotonically toward the data end. Failing colors
 * move in lightness only, so hues stay recognizable. Pure and deterministic;
 * loaded only with the palette engine, never in a prototype's initial JS.
 */

export type ChartMode = 'light' | 'dark';

export const CHART_CATEGORICAL_COUNT = 8;
export const CHART_RAMP_STEPS = 9;
/** Graphical objects need 3:1 against adjacent colors (WCAG 1.4.11). */
export const MIN_CHART_CONTRAST = 3;
/** OKLab distance between any two categorical colors in normal vision. */
export const MIN_CHART_DISTANCE = 0.08;
/**
 * OKLab distance between any two categorical colors under simulated protanopia,
 * deuteranopia and tritanopia (the charts kit checks the first two).
 */
export const MIN_CHART_CVD_DISTANCE = 0.04;

type Linear = readonly [number, number, number];

export type VisionDeficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

/* Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB. */
const MACHADO: Record<VisionDeficiency, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
};

const toLinear = (channel: number) => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function linearRgb(hex: string): Linear {
  const rgb = parseHex(hex);
  if (!rgb) throw new TypeError(`Chart colors must be hex, got "${hex}"`);
  return [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
}

function oklab([r, g, b]: Linear): Linear {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate([r, g, b]: Linear, kind: VisionDeficiency): Linear {
  const m = MACHADO[kind] as number[];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp((m[0] as number) * r + (m[1] as number) * g + (m[2] as number) * b),
    clamp((m[3] as number) * r + (m[4] as number) * g + (m[5] as number) * b),
    clamp((m[6] as number) * r + (m[7] as number) * g + (m[8] as number) * b),
  ];
}

function distance(a: Linear, b: Linear): number {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** OKLab distance between two hex colors, in normal vision or a simulated deficiency. */
export function chartColorDistance(a: string, b: string, vision?: VisionDeficiency): number {
  const p = linearRgb(a);
  const q = linearRgb(b);
  return vision ? distance(simulate(p, vision), simulate(q, vision)) : distance(p, q);
}

const hexToOklch = (hex: string): Oklch => rgbToOklch(parseHex(hex) as [number, number, number]);

const minContrast = (color: string, surfaces: readonly string[]) =>
  Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));

/** Moves lightness away from the surfaces until `color` reaches 3:1 on every one. */
function ensureContrast(color: string, surfaces: readonly string[], mode: ChartMode): string {
  if (minContrast(color, surfaces) >= MIN_CHART_CONTRAST) return color;
  const lch = hexToOklch(color);
  const direction = mode === 'light' ? -1 : 1;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = oklchToHex({ ...lch, l: lch.l + direction * step * 0.01 });
    if (minContrast(candidate, surfaces) >= MIN_CHART_CONTRAST) return candidate;
  }
  return mode === 'light' ? '#000000' : '#ffffff';
}

function pairDistances(a: string, b: string): { normal: number; cvd: number } {
  return {
    normal: chartColorDistance(a, b),
    cvd: Math.min(
      chartColorDistance(a, b, 'protanopia'),
      chartColorDistance(a, b, 'deuteranopia'),
      chartColorDistance(a, b, 'tritanopia')
    ),
  };
}

/** ≥ 1 when `color` clears both distance minimums against every earlier color. */
function separation(color: string, earlier: readonly string[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const other of earlier) {
    const d = pairDistances(color, other);
    worst = Math.min(worst, d.normal / MIN_CHART_DISTANCE, d.cvd / MIN_CHART_CVD_DISTANCE);
  }
  return worst;
}

/** 0, +0.04, −0.04, +0.08, … ±0.36: the nearest lightness moves first. */
const LIGHTNESS_OFFSETS = [
  0,
  ...Array.from({ length: 18 }, (_, i) => (i % 2 ? -1 : 1) * 0.04 * (Math.floor(i / 2) + 1)),
];

/** The lightness (and, for derived colors, hue) variant that keeps 3:1 and separates best. */
function separate(
  color: string,
  earlier: readonly string[],
  surfaces: readonly string[],
  mode: ChartMode,
  extraHues: readonly number[] = []
): string {
  const base = hexToOklch(color);
  let best = color;
  let bestScore = -1;
  for (const hue of [base.h, ...extraHues]) {
    for (const offset of LIGHTNESS_OFFSETS) {
      const candidate = ensureContrast(
        offset === 0 && hue === base.h
          ? color
          : oklchToHex({ ...base, h: hue, l: base.l + offset }),
        surfaces,
        mode
      );
      const score = separation(candidate, earlier);
      if (score >= 1) return candidate;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }
  return best;
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Hues as far as possible (greedily, on a 5° grid) from the hues already used. */
function freeHues(used: readonly number[], count: number): number[] {
  const taken = [...used];
  const out: number[] = [];
  for (let k = 0; k < count; k += 1) {
    let bestHue = 0;
    let bestGap = -1;
    for (let h = 0; h < 360; h += 5) {
      const gap = taken.length === 0 ? 180 : Math.min(...taken.map((t) => hueGap(h, t)));
      if (gap > bestGap) {
        bestGap = gap;
        bestHue = h;
      }
    }
    taken.push(bestHue);
    out.push(bestHue);
  }
  return out;
}

const ACHROMATIC = 0.03;

/** Lightest (light mode) or darkest (dark mode) lightness that still reaches 3:1. */
function contrastLimit(surfaces: readonly string[], mode: ChartMode): number {
  const probe = mode === 'light' ? 0.99 : 0.01;
  return hexToOklch(ensureContrast(oklchToHex({ l: probe, c: 0, h: 0 }), surfaces, mode)).l;
}

/** Grays can only differ in lightness: spread them evenly when they end up too close. */
function respaceGrays(colors: string[], surfaces: readonly string[], mode: ChartMode): void {
  const grays = colors
    .map((color, index) => ({ index, lch: hexToOklch(color) }))
    .filter((entry) => entry.lch.c < ACHROMATIC);
  if (grays.length < 2) return;
  const tooClose = grays.some((a, i) =>
    grays.slice(i + 1).some((b) => {
      const d = pairDistances(colors[a.index] as string, colors[b.index] as string);
      return d.normal < MIN_CHART_DISTANCE || d.cvd < MIN_CHART_CVD_DISTANCE;
    })
  );
  if (!tooClose) return;
  const limit = contrastLimit(surfaces, mode);
  const [low, high] = mode === 'light' ? [0.15, limit] : [limit, 0.985];
  const ordered = [...grays].sort((a, b) => a.lch.l - b.lch.l);
  ordered.forEach((entry, rank) => {
    const l = low + ((high - low) * rank) / (ordered.length - 1);
    colors[entry.index] = ensureContrast(oklchToHex({ ...entry.lch, l }), surfaces, mode);
  });
}

function categorical(tokens: readonly string[], surfaces: readonly string[], mode: ChartMode) {
  const out: string[] = [];
  for (const token of tokens) {
    const original = parseHex(token) ? token.toLowerCase() : '#808080';
    out.push(separate(ensureContrast(original, surfaces, mode), out, surfaces, mode));
  }
  respaceGrays(out, surfaces, mode);
  const chromatic = out.map(hexToOklch).filter((lch) => lch.c > ACHROMATIC);
  const hues = freeHues(
    chromatic.map((lch) => lch.h),
    CHART_CATEGORICAL_COUNT - tokens.length
  );
  const lightness = mode === 'light' ? 0.6 : 0.74;
  for (const hue of hues) {
    const seed = oklchToHex({ l: lightness, c: 0.15, h: hue });
    // Derived colors may also try nearby hues, since they are not theme tokens.
    out.push(separate(seed, out, surfaces, mode, [hue + 20, hue - 20, hue + 40, hue - 40]));
  }
  return out;
}

function ramp(from: Oklch, to: Oklch, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    let dh = to.h - from.h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return oklchToHex({
      l: from.l + (to.l - from.l) * t,
      c: from.c + (to.c - from.c) * t,
      h: from.h + dh * t,
    });
  });
}

/** Lightness at which `lch` first reaches 3:1 on every surface, pushed a little further. */
function dataEndLightness(lch: Oklch, surfaces: readonly string[], mode: ChartMode): number {
  const reached = hexToOklch(
    ensureContrast(oklchToHex({ ...lch, l: mode === 'light' ? 0.7 : 0.5 }), surfaces, mode)
  ).l;
  return mode === 'light' ? Math.max(0.2, reached - 0.08) : Math.min(0.95, reached + 0.08);
}

function sequential(seed: string, surfaces: readonly string[], mode: ChartMode): string[] {
  const lch = hexToOklch(seed);
  const chroma = Math.max(0.04, Math.min(0.18, lch.c));
  const end: Oklch = {
    l: dataEndLightness({ ...lch, c: chroma }, surfaces, mode),
    c: chroma,
    h: lch.h,
  };
  const start: Oklch = { l: mode === 'light' ? 0.96 : 0.3, c: chroma * 0.18, h: lch.h };
  const colors = ramp(start, end, CHART_RAMP_STEPS);
  colors[CHART_RAMP_STEPS - 1] = ensureContrast(
    colors[CHART_RAMP_STEPS - 1] as string,
    surfaces,
    mode
  );
  return colors;
}

function diverging(
  positive: string,
  negativeSeed: string,
  surfaces: readonly string[],
  mode: ChartMode
): string[] {
  const pos = hexToOklch(positive);
  let negHue = parseHex(negativeSeed) ? hexToOklch(negativeSeed).h : pos.h + 180;
  // A negative hue too close to the positive one would read as one color.
  if (hueGap(negHue, pos.h) < 60) negHue = pos.h + 180;
  const chroma = Math.max(0.08, Math.min(0.16, pos.c));
  const ends = [pos.h, negHue].map((h) => dataEndLightness({ l: 0, c: chroma, h }, surfaces, mode));
  const l = mode === 'light' ? Math.min(...ends) : Math.max(...ends);
  const mid: Oklch = { l: mode === 'light' ? 0.95 : 0.32, c: 0.01, h: pos.h };
  const half = (CHART_RAMP_STEPS + 1) / 2;
  const negative = ramp({ l, c: chroma, h: negHue }, { ...mid, h: negHue }, half);
  const positiveSide = ramp({ ...mid, h: pos.h }, { l, c: chroma, h: pos.h }, half);
  const colors = [...negative.slice(0, -1), oklchToHex(mid), ...positiveSide.slice(1)];
  colors[0] = ensureContrast(colors[0] as string, surfaces, mode);
  colors[CHART_RAMP_STEPS - 1] = ensureContrast(
    colors[CHART_RAMP_STEPS - 1] as string,
    surfaces,
    mode
  );
  return colors;
}

function surfacesOf(palette: ThemePalette): string[] {
  const list = [palette.surface, palette.background].filter((color) => parseHex(color) !== null);
  if (!list.length) throw new TypeError('Chart palettes need a hex surface or background');
  return list;
}

/**
 * The validated chart tokens for one mode of a palette: chart1…chart5 repaired
 * where needed (they become `categorical[0…4]`), three derived series colors,
 * the ramps, and the grid and axis colors (the palette's border and muted text).
 */
export function deriveChartTokens(palette: ThemePalette, mode: ChartMode): ThemeChartTokens {
  const surfaces = surfacesOf(palette);
  const colors = categorical(
    [palette.chart1, palette.chart2, palette.chart3, palette.chart4, palette.chart5],
    surfaces,
    mode
  );
  return {
    categorical: colors,
    sequential: sequential(colors[0] as string, surfaces, mode),
    diverging: diverging(colors[0] as string, palette.destructive, surfaces, mode),
    grid: palette.border,
    axis: palette.mutedForeground,
  };
}

export interface ChartPaletteIssue {
  kind: 'contrast' | 'distance' | 'cvd-distance' | 'ramp-order';
  list: 'categorical' | 'sequential' | 'diverging';
  indices: number[];
  value: number;
}

function monotonic(colors: readonly string[], mode: ChartMode, towardData: boolean): boolean {
  const lightness = colors.map((color) => hexToOklch(color).l);
  for (let i = 1; i < lightness.length; i += 1) {
    const delta = (lightness[i] as number) - (lightness[i - 1] as number);
    const step = mode === 'light' ? -delta : delta;
    if ((towardData ? step : -step) < -1e-3) return false;
  }
  return true;
}

/** Checks chart tokens against the palette's surfaces; an empty list means every rule passes. */
export function validateChartTokens(
  tokens: ThemeChartTokens,
  palette: ThemePalette,
  mode: ChartMode
): ChartPaletteIssue[] {
  const surfaces = surfacesOf(palette);
  const issues: ChartPaletteIssue[] = [];
  const contrast = (list: ChartPaletteIssue['list'], index: number, color: string) => {
    const value = minContrast(color, surfaces);
    if (value < MIN_CHART_CONTRAST)
      issues.push({ kind: 'contrast', list, indices: [index], value });
  };
  tokens.categorical.forEach((color, i) => {
    contrast('categorical', i, color);
    for (let j = 0; j < i; j += 1) {
      const d = pairDistances(color, tokens.categorical[j] as string);
      if (d.normal < MIN_CHART_DISTANCE) {
        issues.push({ kind: 'distance', list: 'categorical', indices: [j, i], value: d.normal });
      }
      if (d.cvd < MIN_CHART_CVD_DISTANCE) {
        issues.push({ kind: 'cvd-distance', list: 'categorical', indices: [j, i], value: d.cvd });
      }
    }
  });
  const end = CHART_RAMP_STEPS - 1;
  contrast('sequential', end, tokens.sequential[end] as string);
  if (!monotonic(tokens.sequential, mode, true)) {
    issues.push({ kind: 'ramp-order', list: 'sequential', indices: [], value: 0 });
  }
  contrast('diverging', 0, tokens.diverging[0] as string);
  contrast('diverging', end, tokens.diverging[end] as string);
  const mid = end / 2;
  if (
    !monotonic(tokens.diverging.slice(0, mid + 1), mode, false) ||
    !monotonic(tokens.diverging.slice(mid), mode, true)
  ) {
    issues.push({ kind: 'ramp-order', list: 'diverging', indices: [], value: 0 });
  }
  return issues;
}
