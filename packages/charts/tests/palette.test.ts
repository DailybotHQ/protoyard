import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, loadAllLibraryThemes } from '../../themes/src/index.ts';
import {
  CATEGORICAL_COUNT,
  type ChartPaletteInput,
  chartPalette,
  chartPaletteVariables,
  contrastRatio,
  divergingColor,
  MIN_SURFACE_CONTRAST,
  RAMP_STEPS,
  sequentialColor,
  seriesColor,
  themeToChartInput,
  validateChartTokens,
} from '../src/palette/index.ts';

const MODES = ['light', 'dark'] as const;

describe('chart palettes from @texuli/tokens/palette', () => {
  it('every built-in and library theme yields tokens in both modes', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllLibraryThemes())];
    expect(themes.length).toBeGreaterThanOrEqual(38);
    for (const theme of themes) {
      for (const mode of MODES) {
        const input = themeToChartInput(theme[mode] as Record<string, string>);
        const palette = chartPalette(input, mode);
        expect(palette.categorical, `${theme.id} ${mode}`).toHaveLength(CATEGORICAL_COUNT);
        expect(palette.sequential).toHaveLength(RAMP_STEPS);
        expect(palette.diverging).toHaveLength(RAMP_STEPS);
        expect(palette.grid).toBeTruthy();
        expect(palette.axis).toBeTruthy();
      }
    }
  });

  it('is deterministic', () => {
    const input = themeToChartInput(BUILTIN_THEMES[0]!.dark as Record<string, string>);
    expect(chartPalette(input, 'dark')).toEqual(chartPalette(input, 'dark'));
  });

  it('writes CSS variables for Protoyard chart slots', () => {
    const input = themeToChartInput(BUILTIN_THEMES[0]!.light as Record<string, string>);
    const palette = chartPalette(input, 'light');
    const vars = chartPaletteVariables(palette);
    expect(vars['--tx-chart-1']).toBe(palette.categorical[0]);
    expect(vars['--tx-chart-sequential-1']).toBe(palette.sequential[0]);
    expect(vars['--tx-chart-diverging-5']).toBeTruthy();
    expect(Object.keys(vars).every((name) => name.startsWith('--tx-'))).toBe(true);
    expect(vars).not.toHaveProperty('--py-chart1');
  });

  it('seriesColor and ramp helpers return CSS variables', () => {
    expect(seriesColor(0)).toBe('var(--tx-chart-1)');
    expect(seriesColor(8)).toBe('var(--tx-chart-1)');
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
