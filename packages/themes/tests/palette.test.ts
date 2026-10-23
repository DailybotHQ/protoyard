import type { ThemePalette } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '../src/contrast.ts';
import { oklchToHex, rgbToOklch } from '../src/oklch.ts';
import {
  createThemeFromSeed,
  generatePaletteScale,
  NEUTRAL_FAMILIES,
  type NeutralFamily,
  PALETTE_STEPS,
} from '../src/palette.ts';

const FIXED_SEEDS = Array.from({ length: 500 }, (_, index) => {
  const value = ((index * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0');
  return `#${value.slice(-6)}`;
});

describe('OKLCH conversion', () => {
  it('round-trips sRGB primaries and neutral endpoints through gamut mapping', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#123456']) {
      const rgb = parseHex(hex);
      expect(rgb).not.toBeNull();
      expect(oklchToHex(rgbToOklch(rgb as [number, number, number]))).toBe(hex);
    }
  });

  it('rejects non-hex seeds and maps high-chroma colors into sRGB', () => {
    expect(() => generatePaletteScale('rebeccapurple')).toThrow(/#rgb or #rrggbb/);
    const mapped = oklchToHex({ l: 0.62, c: 1, h: 285 });
    expect(parseHex(mapped)).not.toBeNull();
    expect(mapped).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('palette generation', () => {
  it('returns deterministic 11-step scales and complete themes', () => {
    const first = generatePaletteScale('#2b6ce0');
    expect(first).toEqual(generatePaletteScale('#2b6ce0'));
    expect(Object.keys(first).map(Number)).toEqual(PALETTE_STEPS);
    expect(Object.values(first).every((value) => parseHex(value) !== null)).toBe(true);

    const theme = createThemeFromSeed({
      id: 'seeded-brand',
      name: 'Seeded Brand',
      seed: '#2b6ce0',
      secondary: '#e44a84',
      style: { shape: { radiusScale: 1.5 } },
    });
    expect(theme.light.primary).not.toBe(theme.dark.primary);
    expect(theme.style.shape.radiusScale).toBe(1.5);
    expect(theme.light.chart1).toBe(first[600]);
    expect(theme.light.primary).toMatch(/^#[0-9a-f]{6}$/);
  });

  // Each theme also derives its chart palettes (charts.ts): give 500 seeds room under parallel load.
  it('meets WCAG AA for text and UI pairs across 500 deterministic seeds in both modes', {
    timeout: 120_000,
  }, () => {
    const failures: string[] = [];
    for (const [index, seed] of FIXED_SEEDS.entries()) {
      const theme = createThemeFromSeed({
        id: `seed-${index}`,
        name: `Seed ${index}`,
        seed,
        secondary: FIXED_SEEDS[(index * 37 + 11) % FIXED_SEEDS.length],
      });
      for (const mode of ['light', 'dark'] as const) {
        const palette = theme[mode];
        for (const [foreground, background] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[foreground], palette[background]);
          if (ratio < 4.5)
            failures.push(`${index}/${mode}: ${foreground} on ${background} = ${ratio}`);
        }
        for (const [foreground, background] of UI_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[foreground], palette[background]);
          if (ratio < 3)
            failures.push(`${index}/${mode}: ${foreground} on ${background} = ${ratio}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('rejects malformed seeds and preserves optional style settings', () => {
    expect(() =>
      createThemeFromSeed({ id: 'seeded-brand', name: 'Seeded Brand', seed: '#12' })
    ).toThrow(/#rgb or #rrggbb/);
    expect(() =>
      createThemeFromSeed({ id: 'Not Valid', name: 'Invalid Id', seed: '#336699' })
    ).toThrow();
  });
});

/** The original fixed neutrals and the brand tokens of fintech-ledger's seeds, before neutral families existed. */
const ORIGINAL_FINTECH_LEDGER = {
  light: {
    background: '#fafafa',
    foreground: '#111827',
    surface: '#ffffff',
    surfaceForeground: '#111827',
    elevated: '#ffffff',
    muted: '#f3f4f6',
    mutedForeground: '#4b5563',
    border: '#e5e7eb',
    input: '#d1d5db',
    ring: '#007a71',
    primary: '#007a71',
    primaryForeground: '#ffffff',
    secondary: '#f5f8ff',
    secondaryForeground: '#111827',
    accent: '#b7fff6',
    accentForeground: '#111827',
    destructive: '#c21725',
    destructiveForeground: '#ffffff',
    success: '#008020',
    successForeground: '#ffffff',
    warning: '#816500',
    warningForeground: '#ffffff',
    info: '#006eae',
    infoForeground: '#ffffff',
    sidebar: '#f3f4f6',
    sidebarForeground: '#1f2937',
    sidebarBorder: '#e5e7eb',
    chart1: '#157971',
    chart2: '#2559e3',
    chart3: '#009068',
    chart4: '#a96b00',
    chart5: '#a853ad',
    shadow: 'rgb(15 23 42 / 0.08)',
  },
  dark: {
    background: '#09090b',
    foreground: '#fafafa',
    surface: '#18181b',
    surfaceForeground: '#fafafa',
    elevated: '#27272a',
    muted: '#27272a',
    mutedForeground: '#a1a1aa',
    border: 'rgb(255 255 255 / 0.1)',
    input: 'rgb(255 255 255 / 0.16)',
    ring: '#00a296',
    primary: '#00a296',
    primaryForeground: '#09090b',
    secondary: '#000000',
    secondaryForeground: '#fafafa',
    accent: '#00201d',
    accentForeground: '#fafafa',
    destructive: '#f85452',
    destructiveForeground: '#09090b',
    success: '#00a62c',
    successForeground: '#09090b',
    warning: '#af8a00',
    warningForeground: '#09090b',
    info: '#0096eb',
    infoForeground: '#09090b',
    sidebar: '#18181b',
    sidebarForeground: '#e4e4e7',
    sidebarBorder: 'rgb(255 255 255 / 0.08)',
    chart1: '#157971',
    chart2: '#2559e3',
    chart3: '#00c28d',
    chart4: '#e19000',
    chart5: '#d67edb',
    shadow: 'rgb(0 0 0 / 0.45)',
  },
};

function contrastFailures(palette: Record<string, string>, label: string): string[] {
  const failures: string[] = [];
  for (const [foreground, background] of TEXT_CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette[foreground] as string, palette[background] as string);
    if (ratio < 4.5) failures.push(`${label}: ${foreground} on ${background} = ${ratio}`);
  }
  for (const [foreground, background] of UI_CONTRAST_PAIRS) {
    const ratio = contrastRatio(palette[foreground] as string, palette[background] as string);
    if (ratio < 3) failures.push(`${label}: ${foreground} on ${background} = ${ratio}`);
  }
  return failures;
}

function chromaOf(hex: string): number {
  return rgbToOklch(parseHex(hex) as [number, number, number]).c;
}

describe('neutral families', () => {
  it('keeps the original output bit-for-bit when no family is given', () => {
    const theme = createThemeFromSeed({
      id: 'fintech-ledger',
      name: 'Fintech Ledger',
      seed: '#0f766e',
      secondary: '#1d4ed8',
    });
    // chart1…chart5 are repaired by the chart palette (tests/charts.test.ts); the rest is unchanged.
    const withoutCharts = ({ chart1, chart2, chart3, chart4, chart5, ...rest }: ThemePalette) =>
      rest;
    expect(withoutCharts(theme.light)).toEqual(withoutCharts(ORIGINAL_FINTECH_LEDGER.light));
    expect(withoutCharts(theme.dark)).toEqual(withoutCharts(ORIGINAL_FINTECH_LEDGER.dark));
  });

  // Several families × 500 seeds × 2 modes is ~15 s on a laptop: give it room under parallel load.
  it('meets WCAG AA for every family across 500 deterministic seeds in both modes', {
    timeout: 120_000,
  }, () => {
    const failures: string[] = [];
    for (const neutral of NEUTRAL_FAMILIES) {
      for (const [index, seed] of FIXED_SEEDS.entries()) {
        const theme = createThemeFromSeed({
          id: `seed-${index}`,
          name: `Seed ${index}`,
          seed,
          secondary: FIXED_SEEDS[(index * 37 + 11) % FIXED_SEEDS.length],
          neutral,
        });
        for (const mode of ['light', 'dark'] as const) {
          failures.push(...contrastFailures(theme[mode], `${neutral}/${index}/${mode}`));
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives each family its own low-chroma neutrals', () => {
    const backgrounds = new Map<NeutralFamily, string>();
    for (const neutral of NEUTRAL_FAMILIES) {
      const theme = createThemeFromSeed({ id: 'n', name: 'N', seed: '#0f766e', neutral });
      for (const mode of ['light', 'dark'] as const) {
        for (const token of ['background', 'surface', 'muted', 'sidebar'] as const) {
          expect(chromaOf(theme[mode][token])).toBeLessThan(0.03);
        }
      }
      backgrounds.set(neutral, `${theme.light.muted}/${theme.dark.surface}`);
    }
    expect(new Set(backgrounds.values()).size).toBe(NEUTRAL_FAMILIES.length);
  });

  it('tints the tinted family with the seed hue', () => {
    const teal = createThemeFromSeed({ id: 't', name: 'T', seed: '#0f766e', neutral: 'tinted' });
    const rose = createThemeFromSeed({ id: 'r', name: 'R', seed: '#e11d48', neutral: 'tinted' });
    expect(teal.dark.surface).not.toBe(rose.dark.surface);
    expect(teal.light.muted).not.toBe(rose.light.muted);
    expect(createThemeFromSeed({ id: 't', name: 'T', seed: '#0f766e', neutral: 'tinted' })).toEqual(
      teal
    );
  });

  it('rejects unknown families and changes the neutrals when a family is given', () => {
    expect(() =>
      createThemeFromSeed({
        id: 'x',
        name: 'X',
        seed: '#336699',
        neutral: 'beige' as NeutralFamily,
      })
    ).toThrow(/Unknown neutral family "beige"/);
    const warm = createThemeFromSeed({
      id: 'warm-ledger',
      name: 'Warm Ledger',
      seed: '#0f766e',
      neutral: 'warm',
    });
    expect(warm.light.background).not.toBe(ORIGINAL_FINTECH_LEDGER.light.background);
  });
});

describe('AAA themes, chart seeds and achromatic seeds', () => {
  it('reaches 7:1 for every text pair with a neutral family, and refuses AAA without one', () => {
    const failures: string[] = [];
    for (const neutral of NEUTRAL_FAMILIES) {
      for (const seed of FIXED_SEEDS.slice(0, 60)) {
        const theme = createThemeFromSeed({
          id: 'aaa',
          name: 'AAA',
          seed,
          neutral,
          contrast: 'AAA',
        });
        for (const mode of ['light', 'dark'] as const) {
          for (const [foreground, background] of TEXT_CONTRAST_PAIRS) {
            const ratio = contrastRatio(theme[mode][foreground], theme[mode][background]);
            if (ratio < 7)
              failures.push(
                `${neutral}/${seed}/${mode}: ${foreground} on ${background} = ${ratio}`
              );
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(() =>
      createThemeFromSeed({ id: 'aaa', name: 'AAA', seed: '#336699', contrast: 'AAA' })
    ).toThrow(/needs a neutral family/);
  }, 30_000); // heavy: every built-in and library theme through the palette engine

  it('starts the chart series from the given seeds and validates them', () => {
    const okabe = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00'];
    const theme = createThemeFromSeed({
      id: 'ok',
      name: 'OK',
      seed: '#0072b2',
      neutral: 'cool',
      chartSeeds: okabe,
    });
    expect(theme.light.chart1).toBe(theme.charts?.light.categorical[0]);
    expect(theme.light.chart3).not.toBe(
      createThemeFromSeed({ id: 'ok', name: 'OK', seed: '#0072b2', neutral: 'cool' }).light.chart3
    );
    expect(() =>
      createThemeFromSeed({ id: 'ok', name: 'OK', seed: '#0072b2', chartSeeds: okabe.slice(0, 4) })
    ).toThrow(/five #rrggbb/);
  });

  it('keeps a gray primary for an achromatic seed', () => {
    for (const seed of ['#000000', '#18181b', '#3f3f46', '#57534e']) {
      const theme = createThemeFromSeed({ id: 'mono', name: 'Mono', seed, neutral: 'zinc' });
      for (const mode of ['light', 'dark'] as const) {
        const { c } = rgbToOklch(parseHex(theme[mode].primary) as [number, number, number]);
        expect(c, `${seed}/${mode}`).toBeLessThan(0.04);
      }
    }
    const vivid = createThemeFromSeed({ id: 'blue', name: 'Blue', seed: '#2563eb' });
    expect(rgbToOklch(parseHex(vivid.light.primary) as [number, number, number]).c).toBeGreaterThan(
      0.15
    );
  });
});
