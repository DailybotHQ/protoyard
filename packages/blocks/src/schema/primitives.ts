import { safeHref } from '@protoyard/ai/markdown';
import { z } from 'zod';
import { BLOCK_ICONS } from '../icons.ts';
import { BLOCK_TONES } from './vocabulary.ts';

/**
 * Field-level building blocks shared by every block schema. Blocks are
 * untrusted data (ADR-037): every string is bounded, colors are tones, links
 * pass `safeHref`, and nothing here accepts CSS, HTML or style strings.
 */

/**
 * Content limits per block. They follow the layout limits of the developer's
 * slide system (comparison 2–4 columns, steps up to 8, timeline up to 12,
 * people up to 24…) so a block always fits a slide, a page section or a doc.
 */
export const BLOCK_CONTENT_LIMITS = Object.freeze({
  /** Markdown in a text block. */
  markdown: 4_000,
  /** Markdown in a card, step, callout or list item. */
  shortMarkdown: 600,
  listItems: 12,
  statItems: 6,
  trendPoints: 60,
  tableColumns: 8,
  tableRows: 50,
  timelineEvents: 12,
  steps: 8,
  comparisonColumns: 4,
  comparisonRows: 8,
  cards: 12,
  people: 24,
  ctaActions: 3,
  columns: 4,
  /** Blocks in one column, tab panel or reveal. */
  blocksPerColumn: 12,
  /** Containers (columns, tabs, reveal) nest at most this deep. */
  containerDepth: 3,
  tabPanels: 6,
  pollOptions: 8,
  quizQuestions: 20,
  quizChoices: 6,
  calculatorInputs: 8,
  calculatorOutputs: 6,
  /** Positions on one calculator slider: (max − min) / step. */
  calculatorSteps: 10_000,
  calculatorChartPoints: 50,
  mapPoints: 200,
  mapRoute: 50,
  /** UTF-8 bytes of an embedded app's JSON, and its nesting. */
  embedBytes: 64 * 1024,
  embedDepth: 24,
  formFields: 20,
  formOptions: 20,
  formTextLength: 4_000,
  formTags: 20,
  code: 20_000,
  codeLines: 400,
  highlightSteps: 16,
  /** Width and height in CSS pixels for images and videos. */
  mediaDimension: 4_096,
  href: 2_048,
});

/** A stable block id: deep links, fragments and interactive state keys use it. */
export const BlockIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,47}$/,
    'Use 1–48 lowercase letters, digits or hyphens, starting with a letter'
  );

/** Fragment order inside a slide; pages and docs ignore it. */
export const BlockStepSchema = z.number().int().min(0).max(32);

/** How a block enters when its step is reached. */
export const BLOCK_REVEALS = ['fade', 'fade-up', 'grow', 'highlight', 'strike'] as const;
export const BlockRevealSchema = z.enum(BLOCK_REVEALS);
export type BlockReveal = (typeof BLOCK_REVEALS)[number];

export const BlockToneSchema = z.enum(BLOCK_TONES);

/** Fields every block may carry. */
export const blockBase = {
  id: BlockIdSchema.optional(),
  step: BlockStepSchema.optional(),
  reveal: BlockRevealSchema.optional(),
  tone: BlockToneSchema.optional(),
};

// C0 controls (except the whitespace each kind allows: line breaks in markdown,
// tabs and line breaks in code), DEL, C1 controls, and the
// bidi embeddings, overrides and isolates used in "Trojan Source" spoofing.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const SINGLE_LINE_UNSAFE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const MULTI_LINE_UNSAFE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const CODE_UNSAFE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

/** One line of plain text: no line breaks, control or bidi override characters. */
export function plainText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !SINGLE_LINE_UNSAFE.test(value), {
      message: 'Remove line breaks and control or bidi override characters',
    });
}

/**
 * A markdown source rendered through `@protoyard/ai/markdown` (never as HTML).
 * Line breaks are allowed; control and bidi override characters are not.
 */
export function markdownText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !MULTI_LINE_UNSAFE.test(value), {
      message: 'Remove control or bidi override characters',
    });
}

/** Source code: tabs and line breaks are allowed, other controls are not. */
export function codeText(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !CODE_UNSAFE.test(value), {
      message: 'Remove control or bidi override characters',
    });
}

/**
 * A link target: http(s), mailto, an in-document `#anchor` or a relative path.
 * `javascript:`, `data:`, `vbscript:`, protocol-relative `//host` and any
 * value `safeHref` would have to rewrite are rejected.
 */
export const LinkHrefSchema = z
  .string()
  .min(1)
  .max(BLOCK_CONTENT_LIMITS.href)
  .refine((value) => safeHref(value) === value, {
    message: 'Use an http(s), mailto, #anchor or relative link',
  });

/**
 * An icon from the `BLOCK_ICONS` allow-list (kebab-case Lucide names), so
 * renderers import icons statically and an unknown name fails validation.
 */
export const IconNameSchema = z.enum(BLOCK_ICONS);

export const TextAlignSchema = z.enum(['start', 'center']);
