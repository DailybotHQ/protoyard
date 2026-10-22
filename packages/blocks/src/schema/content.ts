import { ChartSpecSchema } from '@protoyard/ai/chart';
import { z } from 'zod';
import { parseLineSpec } from '../code/highlight.ts';
import { AvatarIdSchema, ImageSourceSchema, VideoSourceSchema } from './media.ts';
import {
  BlockToneSchema,
  blockBase,
  codeText,
  IconNameSchema,
  BLOCK_CONTENT_LIMITS as L,
  LinkHrefSchema,
  markdownText,
  plainText,
  TextAlignSchema,
} from './primitives.ts';

/**
 * The static content blocks (ADR-037). Every schema is strict: an unknown
 * key — `style`, `class`, `html`, `onclick` — is an error, never ignored.
 * Defaults live in the renderers, so a block's input and output types match
 * and the JSON Schema stays exact.
 */

// ── text family ───────────────────────────────────────────────────────────

export const HeadingBlockSchema = z.strictObject({
  type: z.literal('heading'),
  ...blockBase,
  text: plainText(200),
  /** 1 is the document or slide title; renderers clamp to the page outline. */
  level: z.number().int().min(1).max(4).optional(),
  eyebrow: plainText(80).optional(),
  subtitle: plainText(280).optional(),
  align: TextAlignSchema.optional(),
});

export const TextBlockSchema = z.strictObject({
  type: z.literal('text'),
  ...blockBase,
  /** Markdown, parsed by `@protoyard/ai/markdown` and never rendered as HTML. */
  markdown: markdownText(L.markdown),
  size: z.enum(['sm', 'md', 'lg']).optional(),
  align: TextAlignSchema.optional(),
});

const ListItemSchema = z.strictObject({
  text: markdownText(L.shortMarkdown),
  icon: IconNameSchema.optional(),
  /** Only for `style: "check"`. */
  done: z.boolean().optional(),
});

export const ListBlockSchema = z
  .strictObject({
    type: z.literal('list'),
    ...blockBase,
    style: z.enum(['bullet', 'number', 'check', 'icon']).optional(),
    items: z.array(ListItemSchema).min(1).max(L.listItems),
  })
  .superRefine((block, ctx) => {
    block.items.forEach((item, i) => {
      if (item.done !== undefined && block.style !== 'check') {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'done'],
          message: 'Only a list with style "check" marks items done',
        });
      }
      if (block.style === 'icon' && item.icon === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'icon'],
          message: 'A list with style "icon" needs an icon on every item',
        });
      }
    });
  });

export const QuoteBlockSchema = z.strictObject({
  type: z.literal('quote'),
  ...blockBase,
  quote: markdownText(L.shortMarkdown),
  cite: plainText(120).optional(),
  role: plainText(120).optional(),
  avatar: AvatarIdSchema.optional(),
});

export const CalloutBlockSchema = z.strictObject({
  type: z.literal('callout'),
  ...blockBase,
  title: plainText(120).optional(),
  body: markdownText(1_000),
  icon: IconNameSchema.optional(),
});

export const DividerBlockSchema = z.strictObject({
  type: z.literal('divider'),
  ...blockBase,
  label: plainText(60).optional(),
  variant: z.enum(['line', 'space']).optional(),
});

// ── media family ──────────────────────────────────────────────────────────

const dimension = z.number().int().min(1).max(L.mediaDimension);

export const ImageBlockSchema = z
  .strictObject({
    type: z.literal('image'),
    ...blockBase,
    src: ImageSourceSchema,
    /** Required unless the image is decorative. */
    alt: plainText(280).optional(),
    decorative: z.boolean().optional(),
    width: dimension,
    height: dimension,
    caption: plainText(280).optional(),
    credit: plainText(120).optional(),
    fit: z.enum(['contain', 'cover']).optional(),
  })
  .superRefine((block, ctx) => {
    if (block.decorative === true && block.alt !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'A decorative image has no alt text; drop alt or decorative',
      });
    }
    if (block.decorative !== true && block.alt === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'Describe the image in alt, or mark it decorative: true',
      });
    }
  });

export const VideoBlockSchema = z
  .strictObject({
    type: z.literal('video'),
    ...blockBase,
    src: VideoSourceSchema,
    /** The accessible name of the video. */
    label: plainText(160),
    poster: ImageSourceSchema.optional(),
    width: dimension,
    height: dimension,
    caption: plainText(280).optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    muted: z.boolean().optional(),
    controls: z.boolean().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.autoplay === true && block.muted !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['muted'],
        message: 'An autoplaying video must be muted: true',
      });
    }
  });

const PersonSchema = z.strictObject({
  name: plainText(80),
  role: plainText(80).optional(),
  avatar: AvatarIdSchema.optional(),
  bio: plainText(200).optional(),
});

export const PeopleBlockSchema = z.strictObject({
  type: z.literal('people'),
  ...blockBase,
  title: plainText(120).optional(),
  layout: z.enum(['grid', 'row']).optional(),
  people: z.array(PersonSchema).min(1).max(L.people),
});

// ── data family ───────────────────────────────────────────────────────────

const StatSchema = z.strictObject({
  /** Already formatted for display, for example "87%" or "$1.2M". */
  value: plainText(24),
  label: plainText(80),
  delta: plainText(24).optional(),
  deltaTone: BlockToneSchema.optional(),
  context: plainText(160).optional(),
  /** Optional sparkline values, oldest first. */
  trend: z.array(z.number().finite()).min(2).max(L.trendPoints).optional(),
});

export const StatBlockSchema = z.strictObject({
  type: z.literal('stat'),
  ...blockBase,
  title: plainText(120).optional(),
  items: z.array(StatSchema).min(1).max(L.statItems),
  source: plainText(200).optional(),
});

const TableColumnSchema = z.strictObject({
  label: plainText(60),
  align: z.enum(['start', 'center', 'end']).optional(),
  /** `cents` cells are integer minor units, formatted with the table currency. */
  format: z.enum(['text', 'number', 'percent', 'cents']).optional(),
});

const TableCellSchema = z.union([plainText(200), z.number().finite(), z.null()]);

export const TableBlockSchema = z
  .strictObject({
    type: z.literal('table'),
    ...blockBase,
    /** Required: a table's caption is its accessible name. */
    caption: plainText(120),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')
      .optional(),
    columns: z.array(TableColumnSchema).min(1).max(L.tableColumns),
    rows: z.array(z.array(TableCellSchema).max(L.tableColumns)).min(1).max(L.tableRows),
    /** Zero-based row to emphasize. */
    highlightRow: z
      .number()
      .int()
      .min(0)
      .max(L.tableRows - 1)
      .optional(),
  })
  .superRefine((block, ctx) => {
    block.rows.forEach((row, r) => {
      if (row.length !== block.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', r],
          message: `Needs one cell per column (${block.columns.length})`,
        });
        return;
      }
      row.forEach((cell, c) => {
        const format = block.columns[c]?.format ?? 'text';
        if (cell === null) return;
        if (format === 'text' && typeof cell !== 'string') {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', r, c],
            message: 'A text column takes text',
          });
        } else if (format !== 'text' && typeof cell !== 'number') {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', r, c],
            message: `A ${format} column takes numbers`,
          });
        } else if (format === 'cents' && !Number.isInteger(cell)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', r, c],
            message: 'Money is integer cents',
          });
        }
      });
    });
    if (block.highlightRow !== undefined && block.highlightRow >= block.rows.length) {
      ctx.addIssue({ code: 'custom', path: ['highlightRow'], message: 'No such row' });
    }
  });

export const ChartBlockSchema = z.strictObject({
  type: z.literal('chart'),
  ...blockBase,
  /** The same spec as `@protoyard/ai/chart`, validated unchanged. */
  spec: ChartSpecSchema,
  height: z.enum(['sm', 'md', 'lg']).optional(),
  /** Show the data table next to the chart instead of behind a toggle. */
  showTable: z.boolean().optional(),
});

// ── code family ───────────────────────────────────────────────────────────

/** Languages the blocks tokenizer highlights; anything else uses `text`. */
export const CODE_LANGUAGES = [
  'ts',
  'js',
  'json',
  'bash',
  'python',
  'html',
  'css',
  'sql',
  'yaml',
  'text',
] as const;

export { parseLineSpec };

export const CodeBlockSchema = z
  .strictObject({
    type: z.literal('code'),
    ...blockBase,
    code: codeText(L.code),
    lang: z.enum(CODE_LANGUAGES),
    filename: plainText(80).optional(),
    caption: plainText(200).optional(),
    lineNumbers: z.boolean().optional(),
    /** Stepped highlights, one line spec per step: `["1-2", "4,6-8"]`. */
    highlights: z.array(z.string().max(120)).min(1).max(L.highlightSteps).optional(),
  })
  .superRefine((block, ctx) => {
    const lines = block.code.split('\n').length;
    if (lines > L.codeLines) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message: `Keep code to ${L.codeLines} lines or fewer`,
      });
    }
    block.highlights?.forEach((spec, i) => {
      const ranges = parseLineSpec(spec);
      if (!ranges) {
        ctx.addIssue({
          code: 'custom',
          path: ['highlights', i],
          message: 'Use line numbers and ranges like "1-2,4"',
        });
      } else if (ranges.some(([, end]) => end > lines)) {
        ctx.addIssue({
          code: 'custom',
          path: ['highlights', i],
          message: `The code has ${lines} lines`,
        });
      }
    });
  });

// ── structure family ──────────────────────────────────────────────────────

const TimelineEventSchema = z.strictObject({
  time: plainText(40),
  title: plainText(80),
  body: markdownText(280).optional(),
  icon: IconNameSchema.optional(),
  tone: BlockToneSchema.optional(),
});

export const TimelineBlockSchema = z.strictObject({
  type: z.literal('timeline'),
  ...blockBase,
  title: plainText(120).optional(),
  orientation: z.enum(['horizontal', 'vertical']).optional(),
  events: z.array(TimelineEventSchema).min(2).max(L.timelineEvents),
});

const StepSchema = z.strictObject({
  title: plainText(80),
  body: markdownText(L.shortMarkdown).optional(),
  icon: IconNameSchema.optional(),
});

export const StepsBlockSchema = z.strictObject({
  type: z.literal('steps'),
  ...blockBase,
  title: plainText(120).optional(),
  numbered: z.boolean().optional(),
  items: z.array(StepSchema).min(2).max(L.steps),
});

const ComparisonColumnSchema = z.strictObject({
  label: plainText(40),
  /** Emphasize the recommended option. */
  highlight: z.boolean().optional(),
});

const ComparisonRowSchema = z.strictObject({
  label: plainText(60),
  /** Text, or a boolean shown as a labeled check or cross. */
  values: z.array(z.union([plainText(120), z.boolean()])),
});

export const ComparisonBlockSchema = z
  .strictObject({
    type: z.literal('comparison'),
    ...blockBase,
    title: plainText(120).optional(),
    columns: z.array(ComparisonColumnSchema).min(2).max(L.comparisonColumns),
    rows: z.array(ComparisonRowSchema).min(1).max(L.comparisonRows),
  })
  .superRefine((block, ctx) => {
    block.rows.forEach((row, r) => {
      if (row.values.length !== block.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', r, 'values'],
          message: `Needs one value per column (${block.columns.length})`,
        });
      }
    });
  });

const CardSchema = z.strictObject({
  title: plainText(80),
  eyebrow: plainText(40).optional(),
  body: markdownText(L.shortMarkdown).optional(),
  icon: IconNameSchema.optional(),
  image: ImageSourceSchema.optional(),
  /** Alt text for `image`; cards without it treat the image as decorative. */
  imageAlt: plainText(280).optional(),
  href: LinkHrefSchema.optional(),
  tone: BlockToneSchema.optional(),
});

export const CardsBlockSchema = z
  .strictObject({
    type: z.literal('cards'),
    ...blockBase,
    title: plainText(120).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    items: z.array(CardSchema).min(1).max(L.cards),
  })
  .superRefine((block, ctx) => {
    block.items.forEach((card, i) => {
      if (card.imageAlt !== undefined && card.image === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'imageAlt'],
          message: 'imageAlt describes an image; add image or drop imageAlt',
        });
      }
    });
  });

export const IconBlockSchema = z
  .strictObject({
    type: z.literal('icon'),
    ...blockBase,
    icon: IconNameSchema,
    /** The accessible name; required unless the icon is decorative. */
    label: plainText(80).optional(),
    decorative: z.boolean().optional(),
    size: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
  })
  .superRefine((block, ctx) => {
    if ((block.decorative === true) === (block.label !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['label'],
        message: 'Give the icon a label, or mark it decorative: true (not both)',
      });
    }
  });

const CtaActionSchema = z.strictObject({
  label: plainText(40),
  href: LinkHrefSchema,
  variant: z.enum(['primary', 'secondary', 'link']).optional(),
  icon: IconNameSchema.optional(),
});

export const CtaBlockSchema = z.strictObject({
  type: z.literal('cta'),
  ...blockBase,
  title: plainText(120).optional(),
  body: markdownText(L.shortMarkdown).optional(),
  actions: z.array(CtaActionSchema).min(1).max(L.ctaActions),
  footnote: plainText(200).optional(),
});
