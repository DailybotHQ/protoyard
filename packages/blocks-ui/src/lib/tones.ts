/**
 * Block tone → theme-token mapping for structure, diagram and data accents.
 * Contrast checks use the underlying palette tokens (hex), never computed CSS.
 * Color alone never carries meaning: pair tones with text or sr-only labels.
 */
import type { BlockTone } from '@protoyard/blocks';
import { BLOCK_TONES } from '@protoyard/blocks';
import type { ThemeTokenName } from '@protoyard/core';

export type { BlockTone };
export { BLOCK_TONES };

/** Filled icon chip: tinted background + tone-colored glyph. */
export const TONE_ICON: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-primary/15 text-primary',
  info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  danger: 'bg-destructive/15 text-destructive',
});

/** Accent border (cards, diagram nodes). */
export const TONE_BORDER: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: 'border-border',
  accent: 'border-primary/40',
  info: 'border-info/40',
  success: 'border-success/40',
  warning: 'border-warning/40',
  danger: 'border-destructive/40',
});

/** Dot / indicator fill (stats); body text stays `foreground` for contrast. */
export const TONE_INDICATOR: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: 'bg-muted-foreground',
  accent: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
});

/** Screen-reader words when a tone is shown only as color. */
export const TONE_LABELS: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: '',
  accent: '',
  info: 'Note',
  success: 'Positive',
  warning: 'Caution',
  danger: 'Negative',
});

/**
 * Palette token pairs that a tone accent must reach WCAG AA against.
 * Icon chips put tone color on a tinted surface; we check the solid tokens
 * that the Tailwind classes resolve to.
 */
export interface ToneContrastPair {
  tone: BlockTone;
  /** Role of the colored token (text/icon/dot). */
  foreground: ThemeTokenName;
  /** Surfaces the tone sits on in block chrome. */
  backgrounds: readonly ThemeTokenName[];
  /** Minimum ratio (AA normal text = 4.5; UI chrome = 3). */
  minimum: number;
  label: string;
}

export const TONE_CONTRAST_PAIRS: readonly ToneContrastPair[] = Object.freeze([
  {
    tone: 'neutral',
    foreground: 'mutedForeground',
    backgrounds: ['background', 'surface', 'muted'],
    minimum: 4.5,
    label: 'neutral muted text',
  },
  {
    tone: 'accent',
    foreground: 'primary',
    backgrounds: ['background', 'surface', 'muted'],
    minimum: 4.5,
    label: 'accent primary on surfaces',
  },
  {
    tone: 'accent',
    foreground: 'primaryForeground',
    backgrounds: ['primary'],
    minimum: 4.5,
    label: 'accent on primary fill',
  },
  {
    tone: 'info',
    foreground: 'info',
    backgrounds: ['background', 'surface', 'muted'],
    minimum: 4.5,
    label: 'info on surfaces',
  },
  {
    tone: 'info',
    foreground: 'infoForeground',
    backgrounds: ['info'],
    minimum: 4.5,
    label: 'info on info fill',
  },
  {
    tone: 'success',
    foreground: 'success',
    backgrounds: ['background', 'surface', 'muted'],
    minimum: 4.5,
    label: 'success on surfaces',
  },
  {
    tone: 'success',
    foreground: 'successForeground',
    backgrounds: ['success'],
    minimum: 4.5,
    label: 'success on success fill',
  },
  {
    tone: 'warning',
    // warningForeground is written on the warning fill (chip), not as body text on page bg.
    foreground: 'warningForeground',
    backgrounds: ['warning'],
    minimum: 4.5,
    label: 'warning on warning fill',
  },
  {
    tone: 'danger',
    foreground: 'destructive',
    backgrounds: ['background', 'surface', 'muted'],
    minimum: 4.5,
    label: 'danger on surfaces',
  },
  {
    tone: 'danger',
    foreground: 'destructiveForeground',
    backgrounds: ['destructive'],
    minimum: 4.5,
    label: 'danger on destructive fill',
  },
  {
    tone: 'neutral',
    foreground: 'surfaceForeground',
    backgrounds: ['surface'],
    minimum: 4.5,
    label: 'surface body text',
  },
  {
    tone: 'neutral',
    foreground: 'foreground',
    backgrounds: ['background', 'elevated'],
    minimum: 4.5,
    label: 'page body text',
  },
  {
    tone: 'neutral',
    foreground: 'ring',
    backgrounds: ['background', 'surface'],
    minimum: 3,
    label: 'focus ring (UI)',
  },
]);

export function toneIcon(tone: BlockTone | undefined): string {
  return TONE_ICON[tone ?? 'neutral'];
}

export function toneBorder(tone: BlockTone | undefined): string {
  return TONE_BORDER[tone ?? 'neutral'];
}
