import type { ThemeStyleInput } from '@protoyard/core';
import type { NeutralFamily } from '../palette.ts';

/** Shelves the library is browsed by (DevTools, gallery, marketplace, CLI). */
export const THEME_COLLECTIONS = [
  'industry',
  'brand-like',
  'high-contrast',
  'colorblind-safe',
  'seasonal',
  'mono',
] as const;
export type ThemeCollection = (typeof THEME_COLLECTIONS)[number];

/** Mood words a theme can be searched by. */
export const THEME_MOODS = [
  'calm',
  'bold',
  'playful',
  'corporate',
  'editorial',
  'technical',
  'warm',
  'fresh',
  'luxurious',
  'minimal',
] as const;
export type ThemeMood = (typeof THEME_MOODS)[number];

/** WCAG level the theme's text pairs are held to: `AA` 4.5:1, `AAA` 7:1. */
export const THEME_CONTRAST_LEVELS = ['AA', 'AAA'] as const;
export type ThemeContrastLevel = (typeof THEME_CONTRAST_LEVELS)[number];

/**
 * Declarative library preset: seed colors + style profile + catalog metadata.
 * Tokens are built through the palette engine when the theme is loaded.
 */
export interface LibraryThemeDefinition {
  id: string;
  name: string;
  description: string;
  /** Product category this preset targets. */
  category: string;
  tags: readonly string[];
  /** Shelf in the library (default `industry`). */
  collection?: ThemeCollection;
  /** Mood words for search (default none). */
  mood?: readonly ThemeMood[];
  /** Designed to be shown in dark mode first (default `false`). */
  darkFirst?: boolean;
  /** Contrast level the theme is verified at (default `AA`). */
  contrastLevel?: ThemeContrastLevel;
  /** Brand hex seed (`#rrggbb`) for the palette engine. */
  seed: string;
  /** Optional secondary brand hex. */
  secondary?: string;
  /** Neutral family for surfaces, text and borders (absent: the original neutrals). */
  neutral?: NeutralFamily;
  /** Five `#rrggbb` chart seeds (e.g. Okabe-Ito for colorblind-safe themes); repaired like any series. */
  chartSeeds?: readonly string[];
  /** Id from `FONT_CATALOG` (`system`, `editorial`, …). */
  font?: string;
  radius?: string;
  density?: number;
  style?: ThemeStyleInput;
}

/** Eager metadata for pickers — no palette tokens. Optional definition fields arrive with their defaults. */
export interface LibraryThemeMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: readonly string[];
  collection: ThemeCollection;
  mood: readonly ThemeMood[];
  darkFirst: boolean;
  contrastLevel: ThemeContrastLevel;
  /** Brand seed shown as a swatch. */
  seed: string;
  secondary?: string;
  neutral?: NeutralFamily;
}
