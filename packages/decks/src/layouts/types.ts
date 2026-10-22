import type { z } from 'zod';

/**
 * Pacing fit from the keynote blueprint (A–D):
 * punch ≤8 s · idea ≤25 s · diagram · story.
 */
export const LAYOUT_PACING = ['punch', 'idea', 'diagram', 'story'] as const;
export type LayoutPacing = (typeof LAYOUT_PACING)[number];

/** Per-layout size caps (counts, not canvas pixels). */
export interface LayoutLimits {
  /** Human-readable limit lines for agents and docs. */
  summary: readonly string[];
}

/**
 * One entry in the deck layout catalog. AUTHORING consumes this read-only;
 * renderers load the matching decks-ui layout by `id`.
 */
export interface DeckLayoutEntry<TProps = unknown> {
  id: string;
  /** Short editor label. */
  label: string;
  /** One-line description. */
  description: string;
  useWhen: readonly string[];
  dontUseWhen: readonly string[];
  /** Which pacing types this layout fits. */
  pacing: readonly LayoutPacing[];
  limits: LayoutLimits;
  /** Zod schema for the slide `props` object (or free `blocks`). */
  propsSchema: z.ZodType<TProps>;
  /** A minimal valid sample used by tests and agent examples. */
  sample: TProps;
}
