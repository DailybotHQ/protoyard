import {
  contrastRatio,
  hexToOklch,
  linearRgb,
  type Oklch,
  oklabDistance,
  oklchToHex,
  parseHex,
  type Rgb,
  simulateDeficiency,
} from './color.ts';

/*
 * Chart palettes derived from a theme: 8 categorical colors (the theme's
 * chart1…chart5 plus three hues placed away from them), a 9-step sequential
 * ramp and a 9-step diverging ramp. Every color that marks data is checked
 * against the theme's surfaces (≥ 3:1, WCAG 1.4.11 non-text contrast) and
 * the categorical colors against each other, in normal vision and simulated
 * protanopia/deuteranopia. Failing colors are repaired by moving lightness
 * only, so hues stay recognizable. Pure and deterministic.
 */

export type ResolvedMode = 'light' | 'dark';

/** The theme tokens a chart palette is derived from (hex values). */
export interface ChartPaletteInput {
  background: string;
  surface: string;
  destructive?: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
}

export const CATEGORICAL_COUNT = 8;
export const RAMP_STEPS = 9;

/** Graphical objects need 3:1 against adjacent colors (WCAG 1.4.11). */
export const MIN_SURFACE_CONTRAST = 3;
/** OKLab distance between any two categorical colors in normal vision. */
export const MIN_CATEGORICAL_DISTANCE = 0.08;
/** OKLab distance between any two categorical colors under simulated protanopia/deuteranopia. */
export const MIN_CVD_DISTANCE = 0.04;

export interface ChartPalette {
  mode: ResolvedMode;
  /** 8 hex colors for series; legends must still label series, never rely on color alone. */
  categorical: string[];
  /** 9 hex colors, low → high values; the high end keeps ≥ 3:1 against the surfaces. */
  sequential: string[];
  /** 9 hex colors, negative end → neutral midpoint (index 4) → positive end. */
  diverging: string[];
  /** Theme tokens that had to be adjusted to pass (`chart3`, …), for theme authors. */
  repaired: string[];
}

export type PaletteIssueKind = 'contrast' | 'distance' | 'cvd-distance' | 'ramp-order';

export interface PaletteIssue {
  kind: PaletteIssueKind;
  /** Which list and which entries the issue is about. */
  list: 'categorical' | 'sequential' | 'diverging';
  indices: number[];
  value: number;
  required: number;
}

export interface PaletteValidation {
  ok: boolean;
  issues: PaletteIssue[];
}

function surfacesOf(input: ChartPaletteInput): string[] {
  const list = [input.surface, input.background].filter((c) => parseHex(c) !== null);
  if (list.length === 0) {
    throw new TypeError('chartPalette(): surface or background must be a hex color');
  }
  return list;
}

const minContrast = (color: string, surfaces: readonly string[]) =>
  Math.min(...surfaces.map((s) => contrastRatio(color, s)));

/** Darker on light surfaces, lighter on dark ones. */
const awayFromSurface = (mode: ResolvedMode) => (mode === 'light' ? -1 : 1);

/** Moves lightness away from the surface until `color` reaches 3:1 on every surface. */
function ensureContrast(color: string, surfaces: readonly string[], mode: ResolvedMode): string {
  if (minContrast(color, surfaces) >= MIN_SURFACE_CONTRAST) return color;
  const lch = hexToOklch(color);
  const dir = awayFromSurface(mode);
  for (let step = 1; step <= 100; step++) {
    const candidate = oklchToHex({ ...lch, l: lch.l + dir * step * 0.01 });
    if (minContrast(candidate, surfaces) >= MIN_SURFACE_CONTRAST) return candidate;
  }
  return mode === 'light' ? '#000000' : '#ffffff';
}

function distances(a: string, b: string): { normal: number; cvd: number } {
  const p = linearRgb(a);
  const q = linearRgb(b);
  const sim = (rgb: Rgb, kind: 'protanopia' | 'deuteranopia') => simulateDeficiency(rgb, kind);
  return {
    normal: oklabDistance(p, q),
    cvd: Math.min(
      oklabDistance(sim(p, 'protanopia'), sim(q, 'protanopia')),
      oklabDistance(sim(p, 'deuteranopia'), sim(q, 'deuteranopia'))
    ),
  };
}

function separatedFrom(color: string, earlier: readonly string[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const other of earlier) {
    const d = distances(color, other);
    worst = Math.min(worst, d.normal / MIN_CATEGORICAL_DISTANCE, d.cvd / MIN_CVD_DISTANCE);
  }
  return worst;
}

/** 0, +0.04, -0.04, +0.08, … ±0.36: nearest lightness moves first. */
const LIGHTNESS_OFFSETS = [
  0,
  ...Array.from({ length: 18 }, (_, i) => (i % 2 ? -1 : 1) * 0.04 * (Math.floor(i / 2) + 1)),
];

/**
 * The lightness variant of `color` that keeps 3:1 contrast and is most
 * separated from `earlier` (stops at the first one that clears both minimums).
 */
function separate(
  color: string,
  earlier: readonly string[],
  surfaces: readonly string[],
  mode: ResolvedMode,
  extraHues: readonly number[] = []
): string {
  const base = hexToOklch(color);
  let best = color;
  let bestScore = -1;
  for (const hue of [base.h, ...extraHues]) {
    for (const offset of LIGHTNESS_OFFSETS) {
      const candidate = ensureContrast(
        oklchToHex({ ...base, h: hue, l: base.l + offset }),
        surfaces,
        mode
      );
      const score = separatedFrom(candidate, earlier);
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

/** Three hues as far as possible (greedily, 5° grid) from the hues already used. */
function freeHues(used: readonly number[], count: number): number[] {
  const taken = [...used];
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
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

/** Lightest (light mode) or darkest (dark mode) lightness that still reaches 3:1 on every surface. */
function contrastLimit(surfaces: readonly string[], mode: ResolvedMode): number {
  const probe = mode === 'light' ? 0.99 : 0.01;
  return hexToOklch(ensureContrast(oklchToHex({ l: probe, c: 0, h: 0 }), surfaces, mode)).l;
}

/**
 * Gray series can only differ in lightness. When greedy repair leaves two
 * grays too close (a monochrome theme), spread every gray token evenly over
 * the lightness band that keeps 3:1, in their original order.
 */
function respaceGrays(
  colors: string[],
  tokens: readonly string[],
  repaired: string[],
  surfaces: readonly string[],
  mode: ResolvedMode
): void {
  const grays = colors
    .map((color, index) => ({ index, lch: hexToOklch(color) }))
    .filter((entry) => entry.lch.c < ACHROMATIC);
  if (grays.length < 2) return;
  const tooClose = grays.some((a, i) =>
    grays.slice(i + 1).some((b) => {
      const d = distances(colors[a.index] as string, colors[b.index] as string);
      return d.normal < MIN_CATEGORICAL_DISTANCE || d.cvd < MIN_CVD_DISTANCE;
    })
  );
  if (!tooClose) return;
  const limit = contrastLimit(surfaces, mode);
  const [lo, hi] = mode === 'light' ? [0.15, limit] : [limit, 0.985];
  const ordered = [...grays].sort((a, b) => a.lch.l - b.lch.l);
  ordered.forEach((entry, rank) => {
    const l = lo + ((hi - lo) * rank) / (ordered.length - 1);
    const color = ensureContrast(oklchToHex({ ...entry.lch, l }), surfaces, mode);
    colors[entry.index] = color;
    const name = `chart${entry.index + 1}`;
    if (color !== (tokens[entry.index] ?? '').toLowerCase() && !repaired.includes(name))
      repaired.push(name);
  });
  repaired.sort();
}

function categorical(input: ChartPaletteInput, surfaces: readonly string[], mode: ResolvedMode) {
  const tokens = [input.chart1, input.chart2, input.chart3, input.chart4, input.chart5];
  const repaired: string[] = [];
  const out: string[] = [];
  tokens.forEach((token, i) => {
    const original = parseHex(token) ? token.toLowerCase() : '#808080';
    const fixed = separate(ensureContrast(original, surfaces, mode), out, surfaces, mode);
    if (fixed !== original) repaired.push(`chart${i + 1}`);
    out.push(fixed);
  });
  respaceGrays(out, tokens, repaired, surfaces, mode);
  const chromatic = out.map(hexToOklch).filter((c) => c.c > 0.03);
  const hues = freeHues(
    chromatic.map((c) => c.h),
    CATEGORICAL_COUNT - tokens.length
  );
  const lightness = mode === 'light' ? 0.6 : 0.74;
  for (const hue of hues) {
    const seed = oklchToHex({ l: lightness, c: 0.15, h: hue });
    // Derived colors may also try other hues, since they are not theme tokens.
    out.push(separate(seed, out, surfaces, mode, [hue + 20, hue - 20, hue + 40, hue - 40]));
  }
  return { colors: out, repaired };
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

/** Lightness of `hue/chroma` at which the color first reaches 3:1 on every surface, pushed a bit further. */
function dataEndLightness(lch: Oklch, surfaces: readonly string[], mode: ResolvedMode): number {
  const reached = hexToOklch(
    ensureContrast(oklchToHex({ ...lch, l: mode === 'light' ? 0.7 : 0.5 }), surfaces, mode)
  ).l;
  return mode === 'light' ? Math.max(0.2, reached - 0.08) : Math.min(0.95, reached + 0.08);
}

function sequential(seed: string, surfaces: readonly string[], mode: ResolvedMode): string[] {
  const lch = hexToOklch(seed);
  const chroma = Math.max(0.04, Math.min(0.18, lch.c));
  const end: Oklch = {
    l: dataEndLightness({ ...lch, c: chroma }, surfaces, mode),
    c: chroma,
    h: lch.h,
  };
  const start: Oklch = { l: mode === 'light' ? 0.96 : 0.3, c: chroma * 0.18, h: lch.h };
  const colors = ramp(start, end, RAMP_STEPS);
  colors[RAMP_STEPS - 1] = ensureContrast(colors[RAMP_STEPS - 1] as string, surfaces, mode);
  return colors;
}

function diverging(
  positive: string,
  negativeSeed: string | undefined,
  surfaces: readonly string[],
  mode: ResolvedMode
): string[] {
  const pos = hexToOklch(positive);
  let negHue = negativeSeed && parseHex(negativeSeed) ? hexToOklch(negativeSeed).h : pos.h + 180;
  // A negative hue too close to the positive one would read as one color.
  if (hueGap(negHue, pos.h) < 60) negHue = pos.h + 180;
  const chroma = Math.max(0.08, Math.min(0.16, pos.c));
  const ends = [pos.h, negHue].map((h) => dataEndLightness({ l: 0, c: chroma, h }, surfaces, mode));
  const l = mode === 'light' ? Math.min(...ends) : Math.max(...ends);
  const mid: Oklch = { l: mode === 'light' ? 0.95 : 0.32, c: 0.01, h: pos.h };
  const half = (RAMP_STEPS + 1) / 2;
  const negative = ramp({ l, c: chroma, h: negHue }, { ...mid, h: negHue }, half);
  const positiveSide = ramp({ ...mid, h: pos.h }, { l, c: chroma, h: pos.h }, half);
  const colors = [...negative.slice(0, -1), oklchToHex(mid), ...positiveSide.slice(1)];
  colors[0] = ensureContrast(colors[0] as string, surfaces, mode);
  colors[RAMP_STEPS - 1] = ensureContrast(colors[RAMP_STEPS - 1] as string, surfaces, mode);
  return colors;
}

/** Builds the validated chart palette for one resolved mode of a theme. */
export function chartPalette(input: ChartPaletteInput, mode: ResolvedMode): ChartPalette {
  const surfaces = surfacesOf(input);
  const { colors, repaired } = categorical(input, surfaces, mode);
  return {
    mode,
    categorical: colors,
    sequential: sequential(colors[0] as string, surfaces, mode),
    diverging: diverging(colors[0] as string, input.destructive, surfaces, mode),
    repaired,
  };
}

function luminanceOrder(
  colors: readonly string[],
  mode: ResolvedMode,
  ascending: boolean
): boolean {
  const l = colors.map((c) => hexToOklch(c).l);
  for (let i = 1; i < l.length; i++) {
    const delta = (l[i] as number) - (l[i - 1] as number);
    const towardData = mode === 'light' ? -delta : delta;
    if ((ascending ? towardData : -towardData) < -1e-3) return false;
  }
  return true;
}

/** Checks a palette against the theme surfaces; `ok` only when every rule passes. */
export function validateChartPalette(
  palette: ChartPalette,
  input: ChartPaletteInput
): PaletteValidation {
  const surfaces = surfacesOf(input);
  const issues: PaletteIssue[] = [];
  palette.categorical.forEach((color, i) => {
    const value = minContrast(color, surfaces);
    if (value < MIN_SURFACE_CONTRAST) {
      issues.push({
        kind: 'contrast',
        list: 'categorical',
        indices: [i],
        value,
        required: MIN_SURFACE_CONTRAST,
      });
    }
    for (let j = 0; j < i; j++) {
      const d = distances(color, palette.categorical[j] as string);
      if (d.normal < MIN_CATEGORICAL_DISTANCE) {
        issues.push({
          kind: 'distance',
          list: 'categorical',
          indices: [j, i],
          value: d.normal,
          required: MIN_CATEGORICAL_DISTANCE,
        });
      }
      if (d.cvd < MIN_CVD_DISTANCE) {
        issues.push({
          kind: 'cvd-distance',
          list: 'categorical',
          indices: [j, i],
          value: d.cvd,
          required: MIN_CVD_DISTANCE,
        });
      }
    }
  });
  const seqEnd = RAMP_STEPS - 1;
  const seqContrast = minContrast(palette.sequential[seqEnd] as string, surfaces);
  if (seqContrast < MIN_SURFACE_CONTRAST) {
    issues.push({
      kind: 'contrast',
      list: 'sequential',
      indices: [seqEnd],
      value: seqContrast,
      required: MIN_SURFACE_CONTRAST,
    });
  }
  if (!luminanceOrder(palette.sequential, palette.mode, true)) {
    issues.push({ kind: 'ramp-order', list: 'sequential', indices: [], value: 0, required: 0 });
  }
  for (const end of [0, seqEnd]) {
    const value = minContrast(palette.diverging[end] as string, surfaces);
    if (value < MIN_SURFACE_CONTRAST) {
      issues.push({
        kind: 'contrast',
        list: 'diverging',
        indices: [end],
        value,
        required: MIN_SURFACE_CONTRAST,
      });
    }
  }
  const midpoint = (RAMP_STEPS - 1) / 2;
  if (
    !luminanceOrder(palette.diverging.slice(0, midpoint + 1), palette.mode, false) ||
    !luminanceOrder(palette.diverging.slice(midpoint), palette.mode, true)
  ) {
    issues.push({ kind: 'ramp-order', list: 'diverging', indices: [], value: 0, required: 0 });
  }
  return { ok: issues.length === 0, issues };
}
