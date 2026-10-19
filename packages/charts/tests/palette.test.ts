import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, loadAllLibraryThemes } from '../../themes/src/index.ts';
import {
  CATEGORICAL_COUNT,
  type ChartPaletteInput,
  chartPalette,
  chartPaletteVariables,
  contrastRatio,
  divergingColor,
  hexToOklch,
  MIN_SURFACE_CONTRAST,
  oklchToHex,
  RAMP_STEPS,
  readChartPaletteInput,
  sequentialColor,
  simulateDeficiency,
  validateChartPalette,
} from '../src/palette/index.ts';

const MODES = ['light', 'dark'] as const;

describe('chart palettes for every theme', () => {
  it('every built-in and library theme yields a validated palette in both modes', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllLibraryThemes())];
    expect(themes.length).toBeGreaterThanOrEqual(38);
    const repairs: string[] = [];
    for (const theme of themes) {
      for (const mode of MODES) {
        const input = theme[mode] as ChartPaletteInput;
        const palette = chartPalette(input, mode);
        const result = validateChartPalette(palette, input);
        expect(result.issues, `${theme.id} ${mode}`).toEqual([]);
        expect(palette.categorical).toHaveLength(CATEGORICAL_COUNT);
        expect(new Set(palette.categorical).size).toBe(CATEGORICAL_COUNT);
        expect(palette.sequential).toHaveLength(RAMP_STEPS);
        expect(palette.diverging).toHaveLength(RAMP_STEPS);
        if (palette.repaired.length > 0)
          repairs.push(`${theme.id}/${mode}: ${palette.repaired.join(',')}`);
      }
    }
    // The repair list is the to-do list for theme authors (chart tokens below 3:1 or too similar).
    console.info(`chart palette repairs (${repairs.length}):\n${repairs.join('\n')}`);
  });

  it('keeps theme tokens that already pass unchanged', () => {
    const violet = BUILTIN_THEMES.find((t) => t.id === 'violet');
    if (!violet) throw new Error('violet preset missing');
    const palette = chartPalette(violet.light as ChartPaletteInput, 'light');
    const tokens = [
      violet.light.chart1,
      violet.light.chart2,
      violet.light.chart3,
      violet.light.chart5,
    ];
    for (const token of tokens) expect(palette.categorical).toContain(token.toLowerCase());
    expect(palette.repaired).not.toContain('chart1');
  });

  it('is deterministic', () => {
    const input = BUILTIN_THEMES[0]?.dark as ChartPaletteInput;
    expect(chartPalette(input, 'dark')).toEqual(chartPalette(input, 'dark'));
  });
});

describe('repair and validation', () => {
  const surfaces = { background: '#ffffff', surface: '#ffffff', destructive: '#dc2626' };

  it('repairs low-contrast and duplicate tokens by moving lightness', () => {
    const input: ChartPaletteInput = {
      ...surfaces,
      chart1: '#fde68a', // pale yellow: about 1.3:1 on white
      chart2: '#2563eb',
      chart3: '#2563eb', // duplicate of chart2
      chart4: '#16a34a',
      chart5: '#dc2626',
    };
    const palette = chartPalette(input, 'light');
    expect(palette.repaired).toEqual(expect.arrayContaining(['chart1', 'chart3']));
    expect(contrastRatio(palette.categorical[0] as string, '#ffffff')).toBeGreaterThanOrEqual(
      MIN_SURFACE_CONTRAST
    );
    expect(
      Math.abs(hexToOklch(palette.categorical[0] as string).h - hexToOklch('#fde68a').h)
    ).toBeLessThan(8);
    expect(palette.categorical[2]).not.toBe(palette.categorical[1]);
    expect(validateChartPalette(palette, input).ok).toBe(true);
  });

  it('reports contrast, distance and colour-vision issues on an unrepaired palette', () => {
    const input: ChartPaletteInput = {
      ...surfaces,
      chart1: '#fde68a',
      chart2: '#2563eb',
      chart3: '#2563eb',
      chart4: '#16a34a',
      chart5: '#dc2626',
    };
    const palette = chartPalette(input, 'light');
    // Red and green of equal lightness are the classic deuteranopia collision.
    palette.categorical = [
      '#fde68a',
      '#2563eb',
      '#2563eb',
      '#c2410c',
      '#4d7c0f',
      ...palette.categorical.slice(5),
    ];
    const kinds = validateChartPalette(palette, input).issues.map((i) => i.kind);
    expect(kinds).toContain('contrast');
    expect(kinds).toContain('distance');
    expect(kinds).toContain('cvd-distance');
  });

  it('builds ramps that grow toward the data end and keep the end at 3:1', () => {
    for (const mode of MODES) {
      const input: ChartPaletteInput =
        mode === 'light'
          ? {
              ...surfaces,
              chart1: '#7c3aed',
              chart2: '#0284c7',
              chart3: '#0d9488',
              chart4: '#b45309',
              chart5: '#be123c',
            }
          : {
              background: '#09090b',
              surface: '#18181b',
              destructive: '#f87171',
              chart1: '#a78bfa',
              chart2: '#38bdf8',
              chart3: '#2dd4bf',
              chart4: '#fbbf24',
              chart5: '#fb7185',
            };
      const palette = chartPalette(input, mode);
      const lights = palette.sequential.map((c) => hexToOklch(c).l);
      for (let i = 1; i < lights.length; i++) {
        if (mode === 'light')
          expect(lights[i]).toBeLessThanOrEqual((lights[i - 1] as number) + 1e-3);
        else expect(lights[i]).toBeGreaterThanOrEqual((lights[i - 1] as number) - 1e-3);
      }
      expect(
        contrastRatio(palette.sequential.at(-1) as string, input.surface)
      ).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.diverging[0] as string, input.surface)).toBeGreaterThanOrEqual(
        3
      );
      expect(hexToOklch(palette.diverging[4] as string).c).toBeLessThan(0.03);
    }
  });

  it('rejects inputs without a hex surface', () => {
    expect(() =>
      chartPalette(
        {
          background: 'rgb(0 0 0)',
          surface: 'transparent',
          chart1: '#000',
          chart2: '#111',
          chart3: '#222',
          chart4: '#333',
          chart5: '#444',
        },
        'light'
      )
    ).toThrow(TypeError);
  });
});

describe('color math', () => {
  it('round-trips OKLCH and simulates colour-vision deficiency', () => {
    for (const hex of ['#7c3aed', '#0d9488', '#f59e0b', '#ffffff', '#000000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
    const sim = simulateDeficiency([1, 0, 0], 'deuteranopia');
    expect(sim[0]).toBeLessThan(0.5);
    expect(sim[1]).toBeGreaterThan(0.2);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});

describe('CSS variables', () => {
  it('names every categorical, sequential and diverging color', () => {
    const input = BUILTIN_THEMES[0]?.light as ChartPaletteInput;
    const vars = chartPaletteVariables(chartPalette(input, 'light'));
    expect(Object.keys(vars)).toHaveLength(8 + 9 + 9);
    expect(vars['--py-chart8']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--py-seq-9']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--py-div-5']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('maps values to ramp variables and reads input from CSS', () => {
    expect(sequentialColor(0)).toBe('var(--py-seq-1)');
    expect(sequentialColor(1)).toBe('var(--py-seq-9)');
    expect(sequentialColor(Number.NaN)).toBe('var(--py-seq-1)');
    expect(divergingColor(-1)).toBe('var(--py-div-1)');
    expect(divergingColor(0)).toBe('var(--py-div-5)');
    expect(divergingColor(2)).toBe('var(--py-div-9)');
    const css: Record<string, string> = {
      background: ' #ffffff ',
      surface: '#fafafa',
      destructive: '#dc2626',
      chart1: '#7c3aed',
      chart2: '#0284c7',
      chart3: '#0d9488',
      chart4: '#f59e0b',
      chart5: '#f43f5e',
    };
    expect(readChartPaletteInput((token) => css[token] ?? '')).toMatchObject({
      background: '#ffffff',
      chart5: '#f43f5e',
    });
  });
});
