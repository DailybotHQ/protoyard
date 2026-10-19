import type { Theme } from '@protoyard/core';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from './contrast.ts';
import { oklchToHex, rgbToOklch } from './oklch.ts';
import { createThemeFromSeed, type NeutralFamily } from './palette.ts';

export const THEME_HARMONIES = [
  { id: 'complementary', label: 'Complementary', rotations: [180] },
  { id: 'analogous', label: 'Analogous', rotations: [-30] },
  { id: 'triadic', label: 'Triadic', rotations: [120] },
  { id: 'split-complementary', label: 'Split complementary', rotations: [150] },
  { id: 'monochrome', label: 'Monochrome', rotations: [0] },
] as const;

export type ThemeHarmonyId = (typeof THEME_HARMONIES)[number]['id'];

export interface ThemeHarmonySuggestion {
  id: ThemeHarmonyId;
  label: string;
  /** Rotated brand color used as the secondary seed. */
  secondary: string;
  /** Full light/dark theme for previews; its semantic tokens pass AA checks. */
  theme: Theme;
}

function passesAa(theme: Theme): boolean {
  return (['light', 'dark'] as const).every((mode) => {
    const palette = theme[mode];
    return (
      TEXT_CONTRAST_PAIRS.every(([foreground, background]) =>
        palette[foreground] && palette[background]
          ? contrastRatio(palette[foreground], palette[background]) >= 4.5
          : true
      ) &&
      UI_CONTRAST_PAIRS.every(([foreground, background]) =>
        palette[foreground] && palette[background]
          ? contrastRatio(palette[foreground], palette[background]) >= 3
          : true
      )
    );
  });
}

/**
 * Creates deterministic, gamut-mapped secondary suggestions from an OKLCH hue.
 * Candidates that fail the generated theme's light/dark AA checks are omitted.
 */
export function generateThemeHarmonies(
  seed: string,
  neutral: NeutralFamily = 'tinted'
): ThemeHarmonySuggestion[] {
  const color = rgbToOklch(parseSeed(seed));
  return THEME_HARMONIES.flatMap(({ id, label, rotations }) => {
    const rotation = rotations[0];
    const secondary = oklchToHex({
      ...color,
      c: id === 'monochrome' ? Math.max(0.035, color.c * 0.72) : color.c,
      h: (color.h + rotation + 360) % 360,
    });
    const theme = createThemeFromSeed({
      id: `harmony-${id}`,
      name: `${label} suggestion`,
      seed,
      secondary,
      neutral,
    });
    return passesAa(theme) ? [{ id, label, secondary, theme }] : [];
  });
}

function parseSeed(seed: string): [number, number, number] {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(seed)) {
    throw new TypeError(`Palette seed must be a #rgb or #rrggbb color, got "${seed}"`);
  }
  const digits = seed.slice(1);
  const hex = digits.length === 3 ? [...digits].map((part) => part + part).join('') : digits;
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}
