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

// C0/C1 controls, bidi marks/embeddings/overrides/isolates ("Trojan Source"),
// BOMs, the invisible zero-width space and word joiner (U+200B, U+2060) and
// the Unicode line and paragraph separators (U+2028, U+2029). ZWJ/ZWNJ
// (U+200C, U+200D) stay: emoji and some scripts need them. This shared
// predicate also drives the untrusted-input sanitizers.
const UNSAFE_TEXT_CODE_POINT_RANGES = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x061c, 0x061c],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
] as const;

/**
 * Turns U+2028/U+2029 into a line break (multiline text) or a space, so the
 * untrusted loaders keep the word boundary before the schema refuses them.
 */
export function normalizeLineSeparators(value: string, keepNewlines: boolean): string {
  return value.replace(/[\u2028\u2029]/g, keepNewlines ? '\n' : ' ');
}

export function isUnsafeTextCharacter(
  character: string,
  allowNewlines = false,
  allowTabs = false
): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code === 0x0a && allowNewlines) return false;
  if (code === 0x0d && allowNewlines) return false;
  if (code === 0x09 && allowTabs) return false;
  return UNSAFE_TEXT_CODE_POINT_RANGES.some(([start, end]) => code >= start && code <= end);
}

function hasUnsafeText(value: string, allowNewlines = false, allowTabs = false): boolean {
  return [...value].some((character) => isUnsafeTextCharacter(character, allowNewlines, allowTabs));
}

/** One line of plain text: no line breaks, control or bidi override characters. */
export function plainText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasUnsafeText(value), {
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
    .refine((value) => !hasUnsafeText(value, true), {
      message: 'Remove control or bidi override characters',
    });
}

/** Source code: tabs and line breaks are allowed, other controls are not. */
export function codeText(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !hasUnsafeText(value, true, true), {
      message: 'Remove control or bidi override characters',
    });
}

/**
 * A link target: HTTPS or mailto only. Every other scheme, relative path and
 * value `safeHref` would have to rewrite is rejected.
 */
export const LinkHrefSchema = z
  .string()
  .min(1)
  .max(BLOCK_CONTENT_LIMITS.href)
  .refine((value) => safeHref(value) === value, {
    message: 'Use an https: or mailto: link',
  });

/**
 * An icon from the `BLOCK_ICONS` allow-list (kebab-case Lucide names), so
 * renderers import icons statically and an unknown name fails validation.
 */
export const IconNameSchema = z.enum(BLOCK_ICONS);

export const TextAlignSchema = z.enum(['start', 'center']);
