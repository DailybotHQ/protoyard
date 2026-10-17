import { ThemeSchema } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  contrastRatio,
  parseHex,
  relativeLuminance,
  TEXT_CONTRAST_PAIRS,
  themeVariables,
  UI_CONTRAST_PAIRS,
} from '../src/index.ts';

describe('contrast math', () => {
  it('matches known WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(parseHex('rgb(0 0 0)')).toBeNull();
  });
});

describe('built-in themes', () => {
  it('ships the six required presets with unique ids', () => {
    expect(BUILTIN_THEMES.map((t) => t.id)).toEqual([
      'violet',
      'ocean',
      'emerald',
      'rose',
      'amber',
      'monochrome',
    ]);
    for (const theme of BUILTIN_THEMES) expect(ThemeSchema.parse(theme)).toEqual(theme);
  });

  for (const theme of BUILTIN_THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${theme.id}/${mode} meets WCAG AA for text and UI pairs`, () => {
        const palette = theme[mode];
        const failures: string[] = [];
        for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
        }
        for (const [fg, bg] of UI_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 3) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} (UI)`);
        }
        expect(failures).toEqual([]);
      });
    }
  }
});

describe('hover fills', () => {
  for (const theme of BUILTIN_THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${theme.id}/${mode} hover is visible and keeps text AA`, () => {
        const vars = themeVariables({ theme, resolvedMode: mode });
        const palette = theme[mode];
        for (const [fill, text, hover] of [
          [palette.primary, palette.primaryForeground, vars['--py-primary-hover']],
          [palette.destructive, palette.destructiveForeground, vars['--py-destructive-hover']],
        ] as const) {
          expect(hover).toBeDefined();
          expect(contrastRatio(hover as string, text)).toBeGreaterThanOrEqual(4.5);
          expect(
            Math.abs(relativeLuminance(hover as string) - relativeLuminance(fill))
          ).toBeGreaterThanOrEqual(0.01);
        }
      });
    }
  }
});
