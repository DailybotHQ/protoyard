import { defineTheme, type Theme, type ThemeInput } from '@protoyard/core';
import { generateThemeFromSeed, NEUTRAL_FAMILIES } from '@texuli/tokens/generator';
import { deriveChartTokens, generatePaletteScale, PALETTE_STEPS } from '@texuli/tokens/palette';
import { fromTexuliTheme } from './from-texuli.ts';

/**
 * Seed themes. The palette engine is `@texuli/tokens`' generator: Protoyard
 * keeps its public API (`createThemeFromSeed`, `generatePaletteScale`,
 * `NEUTRAL_FAMILIES`) and its defaults (fonts, radius, density, style), and
 * takes every color, chart color included, from Texuli. One engine builds the
 * library, Theme Studio, deck seeds and quick variants.
 */

export { generatePaletteScale, NEUTRAL_FAMILIES, PALETTE_STEPS };
export type PaletteStep = (typeof PALETTE_STEPS)[number];
export type PaletteScale = Record<PaletteStep, string>;
export type NeutralFamily = (typeof NEUTRAL_FAMILIES)[number];

export interface CreateThemeFromSeedInput {
  id: string;
  name: string;
  seed: string;
  secondary?: string;
  /** Neutral family for surfaces, text and borders; `zinc` when omitted. */
  neutral?: NeutralFamily;
  /** `AAA` searches every text pair to 7:1 instead of 4.5:1. */
  contrast?: 'AA' | 'AAA';
  /** Five `#rrggbb` chart seeds (e.g. Okabe-Ito) instead of the derived series. */
  chartSeeds?: readonly string[];
  style?: ThemeInput['style'];
}

/** Builds a complete, accessible light/dark theme from one or two hex brand colors. */
export function createThemeFromSeed(input: CreateThemeFromSeedInput): Theme {
  if (input.neutral !== undefined && !NEUTRAL_FAMILIES.includes(input.neutral)) {
    throw new TypeError(
      `Unknown neutral family "${input.neutral}". Known families: ${NEUTRAL_FAMILIES.join(', ')}`
    );
  }
  const { chartSeeds } = input;
  if (
    chartSeeds &&
    (chartSeeds.length !== 5 || chartSeeds.some((c) => !/^#[0-9a-f]{6}$/i.test(c)))
  ) {
    throw new TypeError('chartSeeds must be five #rrggbb colors.');
  }
  const generated = generateThemeFromSeed({
    seed: input.seed,
    ...(input.secondary ? { secondary: input.secondary } : {}),
    ...(input.neutral ? { neutral: input.neutral } : {}),
    ...(input.contrast === 'AAA' ? { contrast: 'AAA' as const } : {}),
    // Chart seeds replace the five derived series colors; the chart engine
    // still repairs them to the contrast and separation rules.
    deriveCharts: (palette, mode) =>
      deriveChartTokens(
        chartSeeds
          ? {
              ...palette,
              chart1: chartSeeds[0] as string,
              chart2: chartSeeds[1] as string,
              chart3: chartSeeds[2] as string,
              chart4: chartSeeds[3] as string,
              chart5: chartSeeds[4] as string,
            }
          : palette,
        mode
      ),
  });
  // Colors and charts from Texuli; everything else keeps Protoyard's defaults.
  const colors = fromTexuliTheme(generated);
  return defineTheme({
    id: input.id,
    name: input.name,
    description: `Generated from ${input.seed}${input.secondary ? ` and ${input.secondary}` : ''}.`,
    light: colors.light,
    dark: colors.dark,
    ...(colors.charts ? { charts: colors.charts } : {}),
    ...(input.style ? { style: input.style } : {}),
  });
}
