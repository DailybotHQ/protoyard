import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '../../themes/src/index.ts';
import { CHART_TOKENS, extent, plotArea, seriesColor } from '../src/index.ts';
import {
  type ChartPaletteInput,
  chartPalette,
  chartPaletteVariables,
  contrastRatio,
  divergingColor,
  MIN_SURFACE_CONTRAST,
  seriesColor as paletteSeriesColor,
  sequentialColor,
  themeToChartInput,
  validateChartTokens,
} from '../src/palette/index.ts';

describe('@protoyard/charts data contracts', () => {
  it('extent ignores gaps and non-finite values', () => {
    expect(extent([3, null, -2, Number.NaN, 7, undefined, Number.POSITIVE_INFINITY])).toEqual([
      -2, 7,
    ]);
    expect(extent([])).toBeNull();
    expect(extent([null, Number.NaN])).toBeNull();
  });

  it('plotArea subtracts margins and never goes negative', () => {
    const margin = { top: 8, right: 12, bottom: 24, left: 40 };
    expect(plotArea(400, 200, margin)).toEqual({ x: 40, y: 8, width: 348, height: 168 });
    expect(plotArea(20, 10, margin)).toMatchObject({ width: 0, height: 0 });
  });

  it('seriesColor cycles 8 colors, falling back to the theme chart tokens', () => {
    expect(seriesColor(0)).toBe('var(--tx-chart-1)');
    expect(seriesColor(CHART_TOKENS.length - 1)).toBe('var(--tx-chart-5)');
    expect(seriesColor(CHART_TOKENS.length)).toBe('var(--tx-chart-6, var(--tx-chart-1))');
    expect(seriesColor(8)).toBe('var(--tx-chart-1)');
    expect(seriesColor(-1)).toBe('var(--tx-chart-8, var(--tx-chart-3))');
  });
});

describe('@protoyard/charts package exports', () => {
  it('every export target exists', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(pkg.exports)).toEqual([
      '.',
      './scales',
      './shapes',
      './downsample',
      './layout',
      './palette',
      './palette/derive',
    ]);
    for (const target of Object.values(pkg.exports)) {
      expect(existsSync(join(root, target))).toBe(true);
    }
  });
});

describe('chart palettes from @texuli/tokens/palette', () => {
  it('is deterministic and writes CSS variables for Protoyard chart slots', () => {
    const input = themeToChartInput(BUILTIN_THEMES[0]!.light as Record<string, string>);
    const palette = chartPalette(input, 'light');
    expect(chartPalette(input, 'light')).toEqual(palette);
    const vars = chartPaletteVariables(palette);
    expect(vars['--tx-chart-1']).toBe(palette.categorical[0]);
    expect(vars['--tx-chart-sequential-1']).toBe(palette.sequential[0]);
    expect(vars['--tx-chart-diverging-5']).toBeTruthy();
    expect(Object.keys(vars).every((name) => name.startsWith('--tx-'))).toBe(true);
    expect(vars).not.toHaveProperty('--py-chart1');
  });

  it('seriesColor and ramp helpers return CSS variables', () => {
    expect(paletteSeriesColor(0)).toBe('var(--tx-chart-1)');
    expect(paletteSeriesColor(8)).toBe('var(--tx-chart-1)');
    expect(sequentialColor(0)).toMatch(/^var\(--tx-chart-sequential-/);
    expect(divergingColor(0)).toMatch(/^var\(--tx-chart-diverging-/);
  });

  it('validateChartTokens returns an array of issues', () => {
    const input: ChartPaletteInput = {
      background: '#ffffff',
      surface: '#ffffff',
      destructive: '#dc2626',
      border: '#e5e5e5',
      mutedForeground: '#737373',
      chart1: '#2563eb',
      chart2: '#16a34a',
      chart3: '#dc2626',
      chart4: '#ca8a04',
      chart5: '#9333ea',
    };
    const tokens = chartPalette(input, 'light');
    const issues = validateChartTokens(tokens, input, 'light');
    expect(Array.isArray(issues)).toBe(true);
    for (const color of tokens.categorical) {
      expect(contrastRatio(color, input.surface)).toBeGreaterThanOrEqual(
        MIN_SURFACE_CONTRAST - 0.01
      );
    }
  });
});
