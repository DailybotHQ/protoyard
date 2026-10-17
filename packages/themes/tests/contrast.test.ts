import { ThemeSchema } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  contrastRatio,
  parseHex,
  TEXT_CONTRAST_PAIRS,
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
