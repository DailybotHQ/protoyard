/**
 * Chart palette: `@texuli/tokens/palette` `deriveChartTokens`, plus CSS var helpers
 * for Protoyard `--py-chart*` names. No local palette engine.
 */
export {
  CHART_CATEGORICAL_COUNT as CATEGORICAL_COUNT,
  CHART_RAMP_STEPS as RAMP_STEPS,
  type ChartMode,
  type ChartMode as ResolvedMode,
  type ChartPaletteInput,
  type ChartPaletteIssue,
  type ChartPaletteIssue as PaletteIssue,
  type ChartTokens,
  type ChartTokens as ChartPalette,
  chartColorDistance,
  contrastRatio,
  deriveChartTokens,
  deriveChartTokens as chartPalette,
  MIN_CHART_CONTRAST as MIN_SURFACE_CONTRAST,
  MIN_CHART_CVD_DISTANCE as MIN_CVD_DISTANCE,
  MIN_CHART_DISTANCE as MIN_CATEGORICAL_DISTANCE,
  type Oklch,
  oklchToHex,
  parseHex,
  type VisionDeficiency,
  validateChartTokens,
  validateChartTokens as validateChartPalette,
} from '@texuli/tokens/palette';

import {
  CHART_CATEGORICAL_COUNT,
  CHART_RAMP_STEPS,
  type ChartMode,
  type ChartPaletteInput,
  type ChartPaletteIssue,
  type ChartTokens,
  validateChartTokens,
} from '@texuli/tokens/palette';

/** Slot color as a CSS variable (`--py-chart1` …). Slots past theme chart5 fall back. */
export function seriesColor(index: number): string {
  const n = CHART_CATEGORICAL_COUNT;
  const slot = ((Math.trunc(index) % n) + n) % n;
  const primary = slot + 1;
  if (primary <= 5) return `var(--py-chart${primary})`;
  const fallback = ((slot - 5) % 5) + 1;
  return `var(--py-chart${primary}, var(--py-chart${fallback}))`;
}

/** Sequential ramp CSS variable for t in 0…1. */
export function sequentialColor(t: number): string {
  const steps = CHART_RAMP_STEPS;
  const step = Math.round(Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (steps - 1));
  return `var(--py-seq-${step + 1})`;
}

/** Diverging ramp CSS variable for t in −1…1. */
export function divergingColor(t: number): string {
  const steps = CHART_RAMP_STEPS;
  const clamped = Math.min(1, Math.max(-1, Number.isFinite(t) ? t : 0));
  const step = Math.round(((clamped + 1) / 2) * (steps - 1));
  return `var(--py-div-${step + 1})`;
}

/** Writes derived chart tokens as `--py-*` custom properties. */
export function chartPaletteVariables(palette: ChartTokens): Record<string, string> {
  const vars: Record<string, string> = {
    '--py-chart-grid': palette.grid,
    '--py-chart-axis': palette.axis,
  };
  palette.categorical.forEach((color, i) => {
    vars[`--py-chart${i + 1}`] = color;
  });
  palette.sequential.forEach((color, i) => {
    vars[`--py-seq-${i + 1}`] = color;
  });
  palette.diverging.forEach((color, i) => {
    vars[`--py-div-${i + 1}`] = color;
  });
  return vars;
}

export const CHART_PALETTE_INPUT_TOKENS = [
  'background',
  'surface',
  'destructive',
  'border',
  'mutedForeground',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
] as const;

export const CHART_TOKENS = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5'] as const;

export function readChartPaletteInput(
  get: (name: string) => string | null | undefined
): ChartPaletteInput {
  const req = (name: string) => {
    const v = get(name)?.trim();
    if (!v) throw new TypeError(`Missing chart palette token "${name}"`);
    return v;
  };
  return {
    background: req('background'),
    surface: req('surface'),
    destructive: req('destructive'),
    border: req('border'),
    mutedForeground: req('mutedForeground'),
    chart1: req('chart1'),
    chart2: req('chart2'),
    chart3: req('chart3'),
    chart4: req('chart4'),
    chart5: req('chart5'),
  };
}

/** Normalize theme palette → ChartPaletteInput (fills missing roles). */
export function themeToChartInput(palette: Record<string, string>): ChartPaletteInput {
  const pick = (k: string, fallback: string) => {
    const v = palette[k];
    return typeof v === 'string' && v.trim() ? v : fallback;
  };
  return {
    background: pick('background', '#ffffff'),
    surface: pick('surface', pick('background', '#ffffff')),
    destructive: pick('destructive', '#dc2626'),
    border: pick('border', '#e5e5e5'),
    mutedForeground: pick('mutedForeground', '#737373'),
    chart1: pick('chart1', '#2563eb'),
    chart2: pick('chart2', '#16a34a'),
    chart3: pick('chart3', '#dc2626'),
    chart4: pick('chart4', '#ca8a04'),
    chart5: pick('chart5', '#9333ea'),
  };
}

/** Compatibility: old validateChartPalette(palette, input) without mode → uses light. */
export function validateChartPaletteCompat(
  tokens: ChartTokens,
  input: ChartPaletteInput,
  mode: ChartMode = 'light'
): { issues: ChartPaletteIssue[]; ok: boolean } {
  const issues = validateChartTokens(tokens, input, mode);
  return { issues, ok: issues.length === 0 };
}
