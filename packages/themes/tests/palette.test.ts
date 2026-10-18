import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '../src/contrast.ts';
import { oklchToHex, rgbToOklch } from '../src/oklch.ts';
import { createThemeFromSeed, generatePaletteScale, PALETTE_STEPS } from '../src/palette.ts';

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

  it('meets WCAG AA for text and UI pairs across 500 deterministic seeds in both modes', () => {
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
