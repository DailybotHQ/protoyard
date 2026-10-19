import type { ThemeTokenName } from '@protoyard/core';
import type { ChartPalette, ChartPaletteInput } from './chart-palette.ts';
import { CATEGORICAL_COUNT, RAMP_STEPS } from './chart-palette.ts';

/** Categorical theme tokens every theme defines today (`--py-chart1` … `--py-chart5`). */
export const CHART_TOKENS = [
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
] as const satisfies readonly ThemeTokenName[];

/** Theme tokens `chartPalette()` reads. */
export const CHART_PALETTE_INPUT_TOKENS = [
  'background',
  'surface',
  'destructive',
  ...CHART_TOKENS,
] as const satisfies readonly ThemeTokenName[];

/**
 * CSS color for categorical series `index` (0-based), cycling through 8
 * colors. Series 6–8 use `--py-chart6…8`, which a chart root sets from
 * `chartPaletteVariables()`; outside one they fall back to the theme's
 * chart1…chart3, so a series always gets a theme color.
 */
export function seriesColor(index: number): string {
  const slot = ((Math.trunc(index) % CATEGORICAL_COUNT) + CATEGORICAL_COUNT) % CATEGORICAL_COUNT;
  if (slot < CHART_TOKENS.length) return `var(--py-chart${slot + 1})`;
  return `var(--py-chart${slot + 1}, var(--py-chart${slot - CHART_TOKENS.length + 1}))`;
}

/** `var(--py-seq-N)` for a 0…1 value (0 = lowest), on the 9-step sequential ramp. */
export function sequentialColor(t: number): string {
  const step = Math.round(Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP_STEPS - 1));
  return `var(--py-seq-${step + 1})`;
}

/** `var(--py-div-N)` for a −1…1 value (0 = neutral midpoint), on the 9-step diverging ramp. */
export function divergingColor(t: number): string {
  const clamped = Math.min(1, Math.max(-1, Number.isFinite(t) ? t : 0));
  const step = Math.round(((clamped + 1) / 2) * (RAMP_STEPS - 1));
  return `var(--py-div-${step + 1})`;
}

/**
 * Custom properties for a chart root element: `--py-chart1…8` (repaired where
 * needed), `--py-seq-1…9` and `--py-div-1…9`. Recompute when the appearance
 * changes (theme or mode); setting them on the chart root scopes overrides
 * of chart1…5 to the chart.
 */
export function chartPaletteVariables(palette: ChartPalette): Record<string, string> {
  const vars: Record<string, string> = {};
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

/**
 * Builds the palette input from resolved CSS custom properties, e.g.
 * `readChartPaletteInput((t) => getComputedStyle(document.documentElement).getPropertyValue(`--py-${t}`))`.
 */
export function readChartPaletteInput(
  read: (token: (typeof CHART_PALETTE_INPUT_TOKENS)[number]) => string
): ChartPaletteInput {
  const value = (token: (typeof CHART_PALETTE_INPUT_TOKENS)[number]) => read(token).trim();
  return {
    background: value('background'),
    surface: value('surface'),
    destructive: value('destructive'),
    chart1: value('chart1'),
    chart2: value('chart2'),
    chart3: value('chart3'),
    chart4: value('chart4'),
    chart5: value('chart5'),
  };
}
