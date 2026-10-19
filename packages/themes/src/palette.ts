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
  mode: 'light' | 'dark',
  start = mode === 'light' ? 0.52 : 0.48
): string {
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

/**
 * Neutral families for the surfaces, text and borders of a generated theme.
 * Omitting `neutral` keeps the original fixed neutrals, so existing themes do
 * not change. `tinted` uses the seed's own hue at a low chroma.
 */
export const NEUTRAL_FAMILIES = [
  'zinc',
  'slate',
  'stone',
  'gray',
  'warm',
  'cool',
  'tinted',
] as const;
export type NeutralFamily = (typeof NEUTRAL_FAMILIES)[number];

/** OKLCH hue and chroma of each family; `tinted` takes its hue from the seed. */
const NEUTRAL_TINTS: Record<Exclude<NeutralFamily, 'tinted'>, { h: number; c: number }> = {
  zinc: { h: 286, c: 0.006 },
  slate: { h: 257, c: 0.02 },
  stone: { h: 56, c: 0.008 },
  gray: { h: 265, c: 0.012 },
  warm: { h: 70, c: 0.016 },
  cool: { h: 225, c: 0.016 },
};
const TINTED_CHROMA = 0.016;

/** Text tokens come last: they are searched against the backgrounds resolved before them. */
const NEUTRAL_TEXT = {
  foreground: ['background', 'surface', 'elevated', 'muted'],
  mutedForeground: ['background', 'surface', 'muted'],
  sidebarForeground: ['sidebar'],
} as const;
type NeutralToken =
  | 'background'
  | 'surface'
  | 'elevated'
  | 'muted'
  | 'border'
  | 'input'
  | 'sidebar'
  | 'sidebarBorder'
  /** Replacement fills when a secondary or accent fill misses 4.5:1 with its text. */
  | 'fallbackSecondary'
  | 'fallbackAccent'
  | keyof typeof NEUTRAL_TEXT;
/** A string is used as is; a number is an OKLCH lightness in the family's tint (text: the search start). */
type NeutralTable = Record<NeutralToken, string | number>;
type Neutrals = Record<NeutralToken, string>;

/** The original fixed neutrals, kept bit-for-bit for themes without a family. */
const ORIGINAL_NEUTRALS: Record<'light' | 'dark', NeutralTable> = {
  light: {
    background: '#fafafa',
    surface: '#ffffff',
    elevated: '#ffffff',
    muted: '#f3f4f6',
    border: '#e5e7eb',
    input: '#d1d5db',
    sidebar: '#f3f4f6',
    sidebarBorder: '#e5e7eb',
    fallbackSecondary: '#e5e7eb',
    fallbackAccent: '#f3f4f6',
    foreground: '#111827',
    mutedForeground: '#4b5563',
    sidebarForeground: '#1f2937',
  },
  dark: {
    background: '#09090b',
    surface: '#18181b',
    elevated: '#27272a',
    muted: '#27272a',
    border: 'rgb(255 255 255 / 0.1)',
    input: 'rgb(255 255 255 / 0.16)',
    sidebar: '#18181b',
    sidebarBorder: 'rgb(255 255 255 / 0.08)',
    fallbackSecondary: '#27272a',
    fallbackAccent: '#27272a',
    foreground: '#fafafa',
    mutedForeground: '#a1a1aa',
    sidebarForeground: '#e4e4e7',
  },
};

/** Fixed OKLCH lightness per token for every family. Dark borders stay translucent. */
const FAMILY_NEUTRALS: Record<'light' | 'dark', NeutralTable> = {
  light: {
    background: 0.985,
    surface: 1,
    elevated: 1,
    muted: 0.965,
    border: 0.92,
    input: 0.87,
    sidebar: 0.965,
    sidebarBorder: 0.92,
    fallbackSecondary: 0.92,
    fallbackAccent: 0.965,
    foreground: 0.21,
    mutedForeground: 0.5,
    sidebarForeground: 0.28,
  },
  dark: {
    ...ORIGINAL_NEUTRALS.dark,
    background: 0.145,
    surface: 0.21,
    elevated: 0.27,
    muted: 0.27,
    sidebar: 0.21,
    fallbackSecondary: 0.27,
    fallbackAccent: 0.27,
    foreground: 0.985,
    mutedForeground: 0.71,
    sidebarForeground: 0.92,
  },
};

function resolveNeutrals(
  mode: 'light' | 'dark',
  family: NeutralFamily | undefined,
  seedHue: number
): Neutrals {
  const table = (family ? FAMILY_NEUTRALS : ORIGINAL_NEUTRALS)[mode];
  const tint =
    family === 'tinted' ? { h: seedHue, c: TINTED_CHROMA } : NEUTRAL_TINTS[family ?? 'zinc'];
  const neutrals = {} as Neutrals;
  for (const [token, value] of Object.entries(table) as [NeutralToken, string | number][]) {
    if (typeof value === 'string') neutrals[token] = value;
    else if (token in NEUTRAL_TEXT) {
      const backgrounds = NEUTRAL_TEXT[token as keyof typeof NEUTRAL_TEXT].map(
        (key) => neutrals[key]
      );
      neutrals[token] = contrastSafeColor(tint.h, tint.c, backgrounds, 4.5, mode, value);
    } else neutrals[token] = oklchToHex({ l: value, ...tint });
  }
  return neutrals;
}

function paletteFor(
  seedScale: PaletteScale,
  secondaryScale: PaletteScale,
  mode: 'light' | 'dark',
  neutral?: NeutralFamily
) {
  const isLight = mode === 'light';
  const brandHue = rgbToOklch(parseHex(seedScale[500]) as [number, number, number]).h;
  const neutrals = resolveNeutrals(mode, neutral, brandHue);
  const { background, foreground, surface, elevated, muted, mutedForeground } = neutrals;
  const brandBackgrounds = isLight ? [background, surface, muted] : [background, surface, elevated];
  const secondaryHue = rgbToOklch(parseHex(secondaryScale[500]) as [number, number, number]).h;
  const brand = semanticColor(brandHue, mode, brandBackgrounds);
  const fillStep: PaletteStep = isLight ? 100 : 900;
  const fillForeground = foreground;
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
    border: neutrals.border,
    input: neutrals.input,
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
    sidebar: neutrals.sidebar,
    sidebarForeground: neutrals.sidebarForeground,
    sidebarBorder: neutrals.sidebarBorder,
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
    palette.secondary = neutrals.fallbackSecondary;
  }
  if (contrastRatio(palette.accentForeground, palette.accent) < 4.5) {
    palette.accent = neutrals.fallbackAccent;
  }
  return palette;
}

export interface CreateThemeFromSeedInput {
  id: string;
  name: string;
  seed: string;
  secondary?: string;
  /** Neutral family for surfaces, text and borders; omitted keeps the original neutrals. */
  neutral?: NeutralFamily;
  style?: ThemeInput['style'];
}

/** Builds a complete, accessible light/dark theme from one or two hex brand colors. */
export function createThemeFromSeed(input: CreateThemeFromSeedInput): Theme {
  const scale = generatePaletteScale(input.seed);
  const secondaryScale = generatePaletteScale(input.secondary ?? input.seed);
  if (input.neutral !== undefined && !NEUTRAL_FAMILIES.includes(input.neutral)) {
    throw new TypeError(
      `Unknown neutral family "${input.neutral}". Known families: ${NEUTRAL_FAMILIES.join(', ')}`
    );
  }
  const light = paletteFor(scale, secondaryScale, 'light', input.neutral);
  const dark = paletteFor(scale, secondaryScale, 'dark', input.neutral);
  return defineTheme({
    id: input.id,
    name: input.name,
    description: `Generated from ${input.seed}${input.secondary ? ` and ${input.secondary}` : ''}.`,
    light,
    dark,
    ...(input.style ? { style: input.style } : {}),
  });
}
