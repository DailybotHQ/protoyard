import type { ThemeStyleInput } from '@protoyard/core';
import type { NeutralFamily } from '../palette.ts';

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
  /** Brand hex seed (`#rrggbb`) for the palette engine. */
  seed: string;
  /** Optional secondary brand hex. */
  secondary?: string;
  /** Neutral family for surfaces, text and borders (absent: the original neutrals). */
  neutral?: NeutralFamily;
  /** Id from `FONT_CATALOG` (`system`, `editorial`, …). */
  font?: string;
  radius?: string;
  density?: number;
  style?: ThemeStyleInput;
}

/** Eager metadata for pickers — no palette tokens. */
export interface LibraryThemeMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: readonly string[];
  /** Brand seed shown as a swatch. */
  seed: string;
  secondary?: string;
}
