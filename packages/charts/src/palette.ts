import type { ThemeTokenName } from '@protoyard/core';

/** Categorical theme tokens every theme defines today (`--py-chart1` … `--py-chart5`). */
export const CHART_TOKENS = [
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
] as const satisfies readonly ThemeTokenName[];

/**
 * CSS color for categorical series `index` (0-based), cycling through the
 * theme's chart tokens. Charts take color only from theme variables, so
 * light/dark and every theme work without recomputing anything.
 */
export function seriesColor(index: number): string {
  const count = CHART_TOKENS.length;
  const slot = ((Math.trunc(index) % count) + count) % count;
  return `var(--py-${CHART_TOKENS[slot]})`;
}
