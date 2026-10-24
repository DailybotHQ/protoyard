import { type Theme, ThemeSchema } from '@protoyard/core';
import {
  CHART_CATEGORICAL_COUNT,
  chartColorDistance,
  deriveChartTokens,
  MIN_CHART_CVD_DISTANCE,
  validateChartTokens,
} from '@texuli/tokens';
import { beforeAll, describe, expect, it } from 'vitest';
// The charts kit's own palette rules (relative import, as packages/devtools/tests do).
import { chartPalette, validateChartPalette } from '../../charts/src/palette/index.ts';
import {
  applyAppearance,
  CHART_EXTENSION_VARIABLES,
  clearAppearance,
  themeVariables,
} from '../src/apply.ts';
import { loadAllLibraryThemes, THEME_LIBRARY_META } from '../src/library/registry.ts';
import { createThemeFromSeed } from '../src/palette.ts';
import { BUILTIN_THEMES, violetTheme } from '../src/presets.ts';

const MODES = ['light', 'dark'] as const;
const SEEDS = Array.from({ length: 120 }, (_, index) => {
  const value = ((index * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0');
  return `#${value.slice(-6)}`;
});

let themes: Theme[] = [];
beforeAll(async () => {
  themes = [...BUILTIN_THEMES, ...(await loadAllLibraryThemes())];
});

const chartTokens = (palette: Theme['light']) => [
  palette.chart1,
  palette.chart2,
  palette.chart3,
  palette.chart4,
  palette.chart5,
];

describe('theme chart palettes', () => {
  it('pass contrast, separation, color-vision and ramp checks for every preset and library theme', () => {
    expect(themes.length).toBe(BUILTIN_THEMES.length + THEME_LIBRARY_META.length);
    const failures: string[] = [];
    for (const theme of themes) {
      for (const mode of MODES) {
        const tokens = theme.charts?.[mode] ?? deriveChartTokens(theme[mode], mode);
        for (const issue of validateChartTokens(tokens, theme[mode], mode)) {
          failures.push(
            `${theme.id}/${mode}: ${issue.kind} ${issue.list} ${issue.indices.join('-')}`
          );
        }
        tokens.categorical.forEach((color, i) => {
          for (const other of tokens.categorical.slice(0, i)) {
            if (chartColorDistance(color, other, 'tritanopia') < MIN_CHART_CVD_DISTANCE) {
              failures.push(`${theme.id}/${mode}: tritanopia ${other} vs ${color}`);
            }
          }
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it('fixes chart1…chart5 at the source, so the theme tokens are already the validated series', () => {
    for (const theme of themes) {
      for (const mode of MODES) {
        const derived = deriveChartTokens(theme[mode], mode);
        expect(chartTokens(theme[mode]), `${theme.id}/${mode}`).toEqual(
          derived.categorical.slice(0, 5)
        );
      }
    }
  });

  it('leaves nothing for the charts kit to repair', () => {
    // chartPalette is deriveChartTokens; validateChartPalette returns issues[].
    const failures: string[] = [];
    for (const theme of themes) {
      for (const mode of MODES) {
        const palette = chartPalette(theme[mode], mode);
        const issues = validateChartPalette(palette, theme[mode], mode);
        if (issues.length)
          failures.push(
            `${theme.id}/${mode}: ${issues.map((i) => `${i.kind}:${i.list}`).join(',')}`
          );
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives every generated theme a schema-valid charts block that passes in both modes', {
    timeout: 120_000,
  }, () => {
    const failures: string[] = [];
    for (const [index, seed] of SEEDS.entries()) {
      const theme = createThemeFromSeed({
        id: `seed-${index}`,
        name: `Seed ${index}`,
        seed,
        secondary: SEEDS[(index * 37 + 11) % SEEDS.length],
        ...(index % 3 === 0 ? { neutral: 'tinted' as const } : {}),
      });
      expect(ThemeSchema.parse(theme)).toEqual(theme);
      for (const mode of MODES) {
        const tokens = theme.charts?.[mode];
        if (!tokens) throw new Error(`seed ${seed} has no ${mode} charts block`);
        expect(tokens.categorical).toHaveLength(CHART_CATEGORICAL_COUNT);
        expect(chartTokens(theme[mode])).toEqual(tokens.categorical.slice(0, 5));
        for (const issue of validateChartTokens(tokens, theme[mode], mode)) {
          failures.push(`${seed}/${mode}: ${issue.kind} ${issue.list} ${issue.indices.join('-')}`);
        }
        const kitIssues = validateChartPalette(chartPalette(theme[mode], mode), theme[mode], mode);
        if (kitIssues.length) failures.push(`${seed}/${mode}: kit issues ${kitIssues.length}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('is deterministic', () => {
    const palette = violetTheme.dark;
    expect(deriveChartTokens(palette, 'dark')).toEqual(deriveChartTokens(palette, 'dark'));
    expect(createThemeFromSeed({ id: 'a', name: 'A', seed: '#0f766e' }).charts).toEqual(
      createThemeFromSeed({ id: 'a', name: 'A', seed: '#0f766e' }).charts
    );
  });
});

describe('color-vision simulation', () => {
  it('collapses the confusion pairs of each deficiency', () => {
    expect(chartColorDistance('#3366cc', '#3366cc', 'protanopia')).toBe(0);
    const red = '#d62728';
    const green = '#2ca02c';
    expect(chartColorDistance(red, green, 'deuteranopia')).toBeLessThan(
      chartColorDistance(red, green)
    );
    expect(chartColorDistance(red, green, 'protanopia')).toBeLessThan(
      chartColorDistance(red, green)
    );
    const blue = '#1f77b4';
    const teal = '#17becf';
    expect(chartColorDistance(blue, teal, 'tritanopia')).toBeLessThan(
      chartColorDistance(blue, teal)
    );
  });
});

describe('chart tokens in the schema and the CSS variables', () => {
  it('keeps hand-written themes valid without a charts block and rejects malformed blocks', () => {
    expect(violetTheme.charts).toBeUndefined();
    const generated = createThemeFromSeed({ id: 'x', name: 'X', seed: '#2563eb' });
    const charts = generated.charts as NonNullable<Theme['charts']>;
    expect(() =>
      ThemeSchema.parse({
        ...generated,
        charts: {
          ...charts,
          light: { ...charts.light, categorical: charts.light.categorical.slice(1) },
        },
      })
    ).toThrow();
    expect(() =>
      ThemeSchema.parse({
        ...generated,
        charts: {
          ...charts,
          dark: { ...charts.dark, sequential: [...charts.dark.sequential.slice(1), 'red'] },
        },
      })
    ).toThrow();
  });

  it('writes series 1–8, both ramps, grid and axis for a theme with a charts block', () => {
    const theme = createThemeFromSeed({ id: 'x', name: 'X', seed: '#2563eb' });
    const vars = themeVariables({ theme, resolvedMode: 'dark' });
    const charts = theme.charts?.dark;
    expect(vars['--py-chart8']).toBe(charts?.categorical[7]);
    expect(vars['--py-chart1']).toBe(theme.dark.chart1);
    expect(vars['--py-seq-9']).toBe(charts?.sequential[8]);
    expect(vars['--py-div-5']).toBe(charts?.diverging[4]);
    expect(vars['--py-chart-grid']).toBe(theme.dark.border);
    expect(vars['--py-chart-axis']).toBe(theme.dark.mutedForeground);
    for (const name of CHART_EXTENSION_VARIABLES)
      expect(vars[name], name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('writes only grid and axis without a charts block and clears stale series and ramps', () => {
    const vars = themeVariables({ theme: violetTheme, resolvedMode: 'light' });
    expect(vars['--py-chart-grid']).toBe(violetTheme.light.border);
    expect(vars['--py-chart-axis']).toBe(violetTheme.light.mutedForeground);
    expect(CHART_EXTENSION_VARIABLES.some((name) => name in vars)).toBe(false);

    const element = document.createElement('div');
    applyAppearance(element, {
      theme: createThemeFromSeed({ id: 'x', name: 'X', seed: '#2563eb' }),
      resolvedMode: 'light',
    });
    expect(element.style.getPropertyValue('--py-seq-1')).not.toBe('');
    applyAppearance(element, { theme: violetTheme, resolvedMode: 'light' });
    expect(element.style.getPropertyValue('--py-seq-1')).toBe('');
    expect(element.style.getPropertyValue('--py-chart6')).toBe('');
    expect(element.style.getPropertyValue('--py-chart-grid')).toBe(violetTheme.light.border);
    applyAppearance(element, {
      theme: createThemeFromSeed({ id: 'x', name: 'X', seed: '#2563eb' }),
      resolvedMode: 'dark',
    });
    clearAppearance(element);
    expect(element.style.getPropertyValue('--py-div-9')).toBe('');
    expect(element.style.getPropertyValue('--py-chart-axis')).toBe('');
  });
});
