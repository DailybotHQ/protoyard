import { describe, expect, it } from 'vitest';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '../src/contrast.ts';
import { generateThemeHarmonies } from '../src/harmony.ts';

describe('theme color harmonies', () => {
  it('returns the same OKLCH suggestions for the same seed', () => {
    expect(generateThemeHarmonies('#e8590c')).toEqual(generateThemeHarmonies('#e8590c'));
    expect(generateThemeHarmonies('#e8590c').map(({ id }) => id)).toEqual([
      'complementary',
      'analogous',
      'triadic',
      'split-complementary',
      'monochrome',
    ]);
  });

  it('keeps every returned suggestion AA-safe in both modes', () => {
    for (const suggestion of generateThemeHarmonies('#7c3aed')) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = suggestion.theme[mode];
        for (const [foreground, background] of TEXT_CONTRAST_PAIRS) {
          expect(contrastRatio(palette[foreground], palette[background])).toBeGreaterThanOrEqual(
            4.5
          );
        }
        for (const [foreground, background] of UI_CONTRAST_PAIRS) {
          expect(contrastRatio(palette[foreground], palette[background])).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('uses the selected tinted neutral family and rejects malformed seeds', () => {
    expect(generateThemeHarmonies('#e8590c', 'warm')).toHaveLength(5);
    expect(() => generateThemeHarmonies('orange')).toThrow(/#rgb or #rrggbb/);
  });
});
