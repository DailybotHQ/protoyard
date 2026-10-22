/**
 * Shared field schemas for layout props. Media is local-first: relative paths,
 * avatar ids, or data URIs — never brand hex values or site-specific classes.
 */
import { BlockListSchema, ChartSpecSchema } from '@protoyard/blocks';
import { z } from 'zod';

const STEP_MARKER_KEYS = new Set(['step', 'fragment', 'reveal']);

/** Remove animation metadata before validating a catalog layout's strict props. */
export function stripStepMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStepMarkers);
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const hasStep = Object.hasOwn(record, 'step');
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (hasStep && STEP_MARKER_KEYS.has(key)) continue;
    cleaned[key] = stripStepMarkers(item);
  }
  return cleaned;
}

const short = (max: number) => z.string().trim().min(1).max(max);
const optionalShort = (max: number) => z.string().trim().min(1).max(max).optional();

/** Local or embedded image reference (renderer enforces media policy). */
export const LayoutImageSchema = z.strictObject({
  src: short(512),
  alt: z.string().max(300),
  width: z.number().int().min(1).max(4_096).optional(),
  height: z.number().int().min(1).max(4_096).optional(),
});

export const LayoutVideoSchema = z.strictObject({
  src: short(512),
  label: optionalShort(160),
  width: z.number().int().min(1).max(4_096).optional(),
  height: z.number().int().min(1).max(4_096).optional(),
  autoplay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
});

export const TitleHeroPropsSchema = z.strictObject({
  title: short(100),
  subtitle: optionalShort(160),
  meta: optionalShort(160),
});

export const SectionDividerPropsSchema = z.strictObject({
  eyebrow: optionalShort(80),
  title: short(120),
});

export const TwoColumnSplitPropsSchema = z.strictObject({
  title: optionalShort(120),
  left: z.strictObject({ heading: optionalShort(80), body: short(600) }),
  right: z.strictObject({ heading: optionalShort(80), body: short(600) }),
});

export const ThreeColumnCardsPropsSchema = z.strictObject({
  title: optionalShort(120),
  cards: z
    .array(
      z.strictObject({
        icon: optionalShort(40),
        heading: short(80),
        body: short(280),
      })
    )
    .length(3),
});

export const ImageSidePropsSchema = z.strictObject({
  title: optionalShort(120),
  image: LayoutImageSchema,
  heading: optionalShort(80),
  body: short(600),
});

export const ImageCenteredPropsSchema = z.strictObject({
  title: optionalShort(120),
  image: LayoutImageSchema,
  caption: optionalShort(200),
});

export const ImageFullBleedPropsSchema = z.strictObject({
  image: LayoutImageSchema,
  caption: optionalShort(200),
  credit: optionalShort(160),
  overlay: z.enum(['none', 'dark', 'light']).optional(),
});

export const QuotePropsSchema = z.strictObject({
  quote: short(280),
  cite: optionalShort(120),
});

export const CodeWithCalloutPropsSchema = z.strictObject({
  title: optionalShort(120),
  code: z.strictObject({
    lang: short(24),
    source: z.string().min(1).max(8_000),
    highlights: z.array(short(32)).max(16).optional(),
  }),
  heading: optionalShort(80),
  bullets: z.array(short(200)).min(1).max(6),
});

export const BigStatPropsSchema = z.strictObject({
  number: short(32),
  label: short(200),
  context: optionalShort(200),
  source: optionalShort(160),
});

export const ComparisonTablePropsSchema = z.strictObject({
  title: optionalShort(120),
  columns: z.array(short(40)).min(2).max(4),
  rows: z
    .array(
      z.strictObject({
        label: short(80),
        values: z
          .array(z.union([short(80), z.boolean(), z.null()]))
          .min(2)
          .max(4),
      })
    )
    .min(3)
    .max(5)
    .superRefine((rows, ctx) => {
      const width = rows[0]?.values.length ?? 0;
      rows.forEach((row, i) => {
        if (row.values.length !== width) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'values'],
            message: 'Each row must have the same number of values as the first row.',
          });
        }
      });
    }),
});

export const ProcessStepsPropsSchema = z.strictObject({
  title: optionalShort(120),
  steps: z
    .array(z.strictObject({ title: short(80), body: optionalShort(200) }))
    .min(3)
    .max(5),
});

export const TimelinePropsSchema = z.strictObject({
  title: optionalShort(120),
  events: z
    .array(z.strictObject({ time: short(40), text: short(200) }))
    .min(4)
    .max(8),
});

export const TeamAvatarsPropsSchema = z.strictObject({
  title: optionalShort(120),
  people: z
    .array(
      z.strictObject({
        name: short(80),
        role: optionalShort(80),
        avatar: optionalShort(64),
      })
    )
    .min(1)
    .max(8),
});

export const ClosingCtaPropsSchema = z.strictObject({
  title: short(120),
  text: optionalShort(280),
  cta: z.strictObject({
    label: short(60),
    href: short(512),
  }),
  footnote: optionalShort(160),
});

export const VideoCenteredPropsSchema = z.strictObject({
  title: optionalShort(120),
  video: LayoutVideoSchema,
  caption: optionalShort(200),
});

export const VideoSidePropsSchema = z.strictObject({
  title: optionalShort(120),
  video: LayoutVideoSchema,
  heading: optionalShort(80),
  body: short(600),
});

export const ChartLayoutPropsSchema = z.strictObject({
  title: optionalShort(120),
  spec: ChartSpecSchema,
  height: z.enum(['sm', 'md', 'lg']).optional(),
  showTable: z.boolean().optional(),
});

/** Free layout: escape hatch with validated blocks (not a props bag). */
export const FreeLayoutPropsSchema = z.strictObject({
  blocks: BlockListSchema.min(1).max(48),
});
