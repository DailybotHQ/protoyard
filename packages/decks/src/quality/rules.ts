import { DECK_TEXT_MINIMUMS } from '../canvas.ts';
import type { LayoutPacing } from '../layouts/types.ts';

/**
 * Deck quality thresholds as data (ADR-038), ported from the developer's
 * keynote QA (`slides-check.mjs`, `sweep.mjs`). `checkDeckStatic` applies the
 * static rules here; the rendered rules (font size on the canvas, overflow,
 * contrast) need a browser and run in the visual sweep, which reads the same
 * numbers from this object. Neither re-declares a threshold.
 */
export const DECK_QUALITY = Object.freeze({
  /** Minimum rendered body text, in canvas pixels. */
  minBodyPx: DECK_TEXT_MINIMUMS.bodyPx,
  /** Minimum rendered label text (captions, axis ticks, footers), in canvas pixels. */
  minLabelPx: DECK_TEXT_MINIMUMS.labelPx,
  /** Speaker notes shorter than this do not help the presenter. */
  minNotesLength: 40,
  /** The same layout may repeat this many times in a row; one more is flagged. */
  maxLayoutRun: 2,
  /**
   * Visible words per slide for each pacing type: punch (one line, about
   * 8 s), idea (one concept, about 25 s), diagram (labels around a
   * structure), story (a short sequence). A slide may use the most lenient
   * limit among its layout's pacing types.
   */
  maxWords: Object.freeze({ punch: 15, idea: 45, diagram: 60, story: 50 } satisfies Record<
    LayoutPacing,
    number
  >),
  /** Notes that only tell the presenter not to read the slide are boilerplate. */
  notesBoilerplate: Object.freeze([
    'do not read the slide',
    "don't read the slide",
    'dont read the slide',
    'no leer la slide',
    'no leer la diapositiva',
  ]),
});

export type DeckQualitySeverity = 'error' | 'warning';

export interface DeckQualityRule {
  id: string;
  severity: DeckQualitySeverity;
  /** `static`: `checkDeckStatic` checks it. `rendered`: needs a browser (the visual sweep). */
  check: 'static' | 'rendered';
  description: string;
}

/**
 * Every deck quality rule, for `deck lint`, the visual sweep and docs.
 * Severity follows PLAN_005: structure, assets and step order fail; density,
 * repetition, notes and estimated contrast warn.
 */
export const DECK_QUALITY_RULES = Object.freeze([
  {
    id: 'unknown-layout',
    severity: 'error',
    check: 'static',
    description: 'A slide names a layout the catalog does not have.',
  },
  {
    id: 'layout-props',
    severity: 'error',
    check: 'static',
    description: "A catalog slide's props break its layout's schema or size limits.",
  },
  {
    id: 'image-alt',
    severity: 'error',
    check: 'static',
    description: 'An image in layout props has no alt text.',
  },
  {
    id: 'image-size',
    severity: 'error',
    check: 'static',
    description: 'An image in layout props has no width and height (the layout would shift).',
  },
  {
    id: 'step-order',
    severity: 'error',
    check: 'static',
    description: 'A fragment reveals before content that comes earlier on the slide.',
  },
  {
    id: 'empty-steps',
    severity: 'warning',
    check: 'static',
    description: 'A slide labels more steps than it has fragments, so some clicks do nothing.',
  },
  {
    id: 'notes-missing',
    severity: 'warning',
    check: 'static',
    description: `A visible slide has no speaker notes, or notes under ${DECK_QUALITY.minNotesLength} characters.`,
  },
  {
    id: 'notes-duplicate',
    severity: 'warning',
    check: 'static',
    description: 'Two slides have the same speaker notes.',
  },
  {
    id: 'notes-boilerplate',
    severity: 'warning',
    check: 'static',
    description: 'Speaker notes only say not to read the slide.',
  },
  {
    id: 'layout-repetition',
    severity: 'warning',
    check: 'static',
    description: `More than ${DECK_QUALITY.maxLayoutRun} visible slides in a row use the same layout.`,
  },
  {
    id: 'too-many-words',
    severity: 'warning',
    check: 'static',
    description: "A slide shows more words than its layout's pacing allows.",
  },
  {
    id: 'font-too-small',
    severity: 'error',
    check: 'rendered',
    description: `Rendered text is below ${DECK_QUALITY.minBodyPx} px (body) or ${DECK_QUALITY.minLabelPx} px (labels) on the canvas.`,
  },
  {
    id: 'overflow',
    severity: 'error',
    check: 'rendered',
    description: 'Content renders outside the slide canvas.',
  },
  {
    id: 'image-failed',
    severity: 'error',
    check: 'rendered',
    description: 'An image does not load.',
  },
  {
    id: 'low-contrast',
    severity: 'warning',
    check: 'rendered',
    description: 'Estimated text contrast is below WCAG AA on the rendered slide.',
  },
] as const satisfies readonly DeckQualityRule[]);

export type DeckQualityRuleId = (typeof DECK_QUALITY_RULES)[number]['id'];

export const DECK_QUALITY_RULE_BY_ID: Readonly<Record<DeckQualityRuleId, DeckQualityRule>> =
  Object.freeze(
    Object.fromEntries(DECK_QUALITY_RULES.map((rule) => [rule.id, rule])) as Record<
      DeckQualityRuleId,
      DeckQualityRule
    >
  );
