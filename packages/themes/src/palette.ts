import { defineTheme, type Theme, type ThemeInput, type ThemePalette } from '@protoyard/core';
import { contrastRatio, parseHex } from './contrast.ts';
import { oklchToHex, rgbToOklch } from './oklch.ts';

export const PALETTE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type PaletteStep = (typeof PALETTE_STEPS)[number];
export type PaletteScale = Record<PaletteStep, string>;

const LIGHTNESS: readonly [PaletteStep, number][] = [
  [50, 0.98],
  [100, 0.95],
  [200, 0.9],
  [300, 0.82],
  [400, 0.72],
  [500, 0.62],
  [600, 0.52],
  [700, 0.42],
  [800, 0.32],
  [900, 0.22],
  [950, 0.12],
];

function seedColorToOklch(seed: string) {
  const rgb = parseHex(seed);
  if (!rgb) throw new TypeError(`Palette seed must be a #rgb or #rrggbb color, got "${seed}"`);
  return rgbToOklch(rgb);
}

/** Creates a deterministic, gamut-mapped 11-step scale from a hex seed. */
export function generatePaletteScale(seed: string): PaletteScale {
  const color = seedColorToOklch(seed);
  const chroma = Math.min(color.c, 0.24);
  return Object.fromEntries(
    LIGHTNESS.map(([step, lightness]) => [step, oklchToHex({ ...color, l: lightness, c: chroma })])
  ) as PaletteScale;
}

function contrastSafeColor(
  hue: number,
  chroma: number,
  backgrounds: readonly string[],
  minimum: number,
  mode: 'light' | 'dark'
): string {
  const start = mode === 'light' ? 0.52 : 0.48;
  const direction = mode === 'light' ? -1 : 1;
  for (let step = 0; step <= 100; step += 1) {
    const l = Math.min(1, Math.max(0, start + direction * step * 0.01));
    const candidate = oklchToHex({ l, c: chroma, h: hue });
    if (backgrounds.every((background) => contrastRatio(candidate, background) >= minimum)) {
      return candidate;
    }
  }
  // At the sRGB extremes, neutral black or white always meets the requested ratio.
  return mode === 'light' ? '#000000' : '#ffffff';
}

function semanticColor(hue: number, mode: 'light' | 'dark', backgrounds: readonly string[]) {
  return contrastSafeColor(hue, 0.2, backgrounds, 4.5, mode);
}

function accessibleFill(hue: number, text: string, mode: 'light' | 'dark'): string {
  for (let step = 0; step <= 100; step += 1) {
    const l = mode === 'light' ? 0.98 - step * 0.005 : 0.02 + step * 0.005;
    const candidate = oklchToHex({ l, c: 0.12, h: hue });
    if (contrastRatio(text, candidate) >= 4.5) return candidate;
  }
  return mode === 'light' ? '#f3f4f6' : '#27272a';
}

function paletteFor(seedScale: PaletteScale, secondaryScale: PaletteScale, mode: 'light' | 'dark') {
  const isLight = mode === 'light';
  const background = isLight ? '#fafafa' : '#09090b';
  const foreground = isLight ? '#111827' : '#fafafa';
  const surface = isLight ? '#ffffff' : '#18181b';
  const elevated = isLight ? '#ffffff' : '#27272a';
  const muted = isLight ? '#f3f4f6' : '#27272a';
  const mutedForeground = isLight ? '#4b5563' : '#a1a1aa';
  const brandBackgrounds = isLight ? [background, surface, muted] : [background, surface, elevated];
  const brandHue = rgbToOklch(parseHex(seedScale[500]) as [number, number, number]).h;
  const secondaryHue = rgbToOklch(parseHex(secondaryScale[500]) as [number, number, number]).h;
  const brand = semanticColor(brandHue, mode, brandBackgrounds);
  const fillStep: PaletteStep = isLight ? 100 : 900;
  const fillForeground = isLight ? '#111827' : '#fafafa';
  const semanticFillForeground = isLight ? '#ffffff' : '#09090b';
  const secondaryFill = accessibleFill(secondaryHue, fillForeground, mode);

  const palette: ThemePalette = {
    background,
    foreground,
    surface,
    surfaceForeground: foreground,
    elevated,
    muted,
    mutedForeground,
    border: isLight ? '#e5e7eb' : 'rgb(255 255 255 / 0.1)',
    input: isLight ? '#d1d5db' : 'rgb(255 255 255 / 0.16)',
    ring: brand,
    primary: brand,
    primaryForeground: semanticFillForeground,
    secondary: secondaryFill,
    secondaryForeground: fillForeground,
    accent: seedScale[fillStep],
    accentForeground: fillForeground,
    destructive: semanticColor(25, mode, brandBackgrounds),
    destructiveForeground: semanticFillForeground,
    success: semanticColor(145, mode, brandBackgrounds),
    successForeground: semanticFillForeground,
    warning: semanticColor(90, mode, brandBackgrounds),
    warningForeground: semanticFillForeground,
    info: semanticColor(245, mode, brandBackgrounds),
    infoForeground: semanticFillForeground,
    sidebar: isLight ? '#f3f4f6' : '#18181b',
    sidebarForeground: isLight ? '#1f2937' : '#e4e4e7',
    sidebarBorder: isLight ? '#e5e7eb' : 'rgb(255 255 255 / 0.08)',
    chart1: seedScale[600],
    chart2: secondaryScale[600],
    chart3: oklchToHex({ l: isLight ? 0.58 : 0.72, c: 0.16, h: 165 }),
    chart4: oklchToHex({ l: isLight ? 0.58 : 0.72, c: 0.16, h: 70 }),
    chart5: oklchToHex({ l: isLight ? 0.58 : 0.72, c: 0.16, h: 325 }),
    shadow: isLight ? 'rgb(15 23 42 / 0.08)' : 'rgb(0 0 0 / 0.45)',
  };

  // The scale values above provide hue variety; these assertions catch future
  // edits that accidentally weaken the semantic palette repair.
  if (contrastRatio(palette.secondaryForeground, palette.secondary) < 4.5) {
    palette.secondary = isLight ? '#e5e7eb' : '#27272a';
  }
  if (contrastRatio(palette.accentForeground, palette.accent) < 4.5) {
    palette.accent = isLight ? '#f3f4f6' : '#27272a';
  }
  return palette;
}

export interface CreateThemeFromSeedInput {
  id: string;
  name: string;
  seed: string;
  secondary?: string;
  style?: ThemeInput['style'];
}

/** Builds a complete, accessible light/dark theme from one or two hex brand colors. */
export function createThemeFromSeed(input: CreateThemeFromSeedInput): Theme {
  const scale = generatePaletteScale(input.seed);
  const secondaryScale = generatePaletteScale(input.secondary ?? input.seed);
  const light = paletteFor(scale, secondaryScale, 'light');
  const dark = paletteFor(scale, secondaryScale, 'dark');
  return defineTheme({
    id: input.id,
    name: input.name,
    description: `Generated from ${input.seed}${input.secondary ? ` and ${input.secondary}` : ''}.`,
    light,
    dark,
    ...(input.style ? { style: input.style } : {}),
  });
}
