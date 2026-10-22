import { DECK_TEXT_MINIMUMS } from '@protoyard/decks';

/**
 * The slide type scale, in virtual-canvas pixels. Sizes follow the slide's
 * width through container query units (`cqw`, the slide section is an inline
 * size container), so the same deck reads well on 16:9, 4:3, 9:16 and 1:1
 * stages, and they never drop below the deck text minimums (24 px body,
 * 18 px labels) that deck lint checks.
 */
export interface TypeStep {
  /** Smallest size, for narrow stages (9:16 is 720 px wide). */
  minPx: number;
  /** Preferred size as a share of the slide width (1cqw = 1 % of it). */
  cqw: number;
  /** Largest size, for wide stages. */
  maxPx: number;
}

export const DECK_TYPE_STEPS = {
  /** Cover and section-divider titles. */
  display: { minPx: 56, cqw: 7.5, maxPx: 112 },
  /** The big-stat number. */
  stat: { minPx: 96, cqw: 15, maxPx: 220 },
  /** Slide titles on content layouts. */
  title: { minPx: 40, cqw: 4.2, maxPx: 60 },
  /** Pull quotes. */
  quote: { minPx: 36, cqw: 4.4, maxPx: 60 },
  /** Subtitles, stat labels, card headings. */
  lead: { minPx: 28, cqw: 2.6, maxPx: 36 },
  /** Body copy. */
  body: { minPx: DECK_TEXT_MINIMUMS.bodyPx, cqw: 2.1, maxPx: 28 },
  /** Eyebrows and meta: small caps style. */
  label: { minPx: DECK_TEXT_MINIMUMS.labelPx, cqw: 1.5, maxPx: 20 },
  /** Captions, sources, credits and footnotes: small sentence case. */
  caption: { minPx: DECK_TEXT_MINIMUMS.labelPx, cqw: 1.5, maxPx: 20 },
} as const satisfies Record<string, TypeStep>;

export type TypeStepName = keyof typeof DECK_TYPE_STEPS;

/** The size of a step on a slide `width` px wide (what the CSS clamp resolves to). */
export function typeSize(step: TypeStepName, width: number): number {
  const { minPx, cqw, maxPx } = DECK_TYPE_STEPS[step];
  return Math.min(maxPx, Math.max(minPx, (width * cqw) / 100));
}

/**
 * Tailwind classes per step. Written out in full (not built from the numbers)
 * so Tailwind's scanner sees them; `tests/layout-design.test.ts` checks they
 * match `DECK_TYPE_STEPS`.
 */
export const DECK_TYPE = {
  display:
    'font-heading text-[length:clamp(56px,7.5cqw,112px)] font-bold leading-[1.02] tracking-[-0.03em] text-balance',
  stat: 'font-heading text-[length:clamp(96px,15cqw,220px)] font-extrabold leading-[0.9] tracking-[-0.04em] tabular-nums',
  title:
    'font-heading text-[length:clamp(40px,4.2cqw,60px)] font-bold leading-[1.08] tracking-[-0.02em] text-balance',
  quote:
    'font-heading text-[length:clamp(36px,4.4cqw,60px)] font-semibold leading-[1.18] tracking-[-0.01em] text-balance',
  lead: 'text-[length:clamp(28px,2.6cqw,36px)] leading-snug',
  body: 'text-[length:clamp(24px,2.1cqw,28px)] leading-[1.4]',
  label:
    'text-[length:clamp(18px,1.5cqw,20px)] font-semibold uppercase leading-tight tracking-[0.16em]',
  caption: 'text-[length:clamp(18px,1.5cqw,20px)] leading-snug',
} as const satisfies Record<TypeStepName, string>;
