import { z } from 'zod';
import type { AiChartSpec } from './types.ts';

/*
 * `@protoyard/ai/chart`: the schema for chart answers. Response packs write a
 * spec with `chartBlock(spec)`; renderers read a fence with `parseChartSpec`.
 * The spec is JSON parsed with `JSON.parse` and validated here: nothing in it
 * is executed, and every string is bounded and later rendered as text.
 */

/** Fence bodies longer than this are rejected before parsing. */
export const CHART_SPEC_MAX_LENGTH = 20_000;
export const CHART_MAX_POINTS = 366;
export const CHART_MAX_SERIES = 8;

const PART_WHOLE = new Set(['donut', 'pie', 'funnel']);
const UNSAFE_LABEL_CODE_POINT_RANGES = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x061c, 0x061c],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
] as const;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        ![...value].some((character) => {
          const code = character.codePointAt(0) ?? 0;
          return UNSAFE_LABEL_CODE_POINT_RANGES.some(
            ([start, end]) => code >= start && code <= end
          );
        }),
      {
        message: 'Remove control or bidirectional characters',
      }
    );

export const ChartSpecSchema = z
  .strictObject({
    kind: z.enum(['line', 'area', 'bar', 'donut', 'pie', 'funnel']),
    title: text(120),
    description: text(280).optional(),
    unit: z.enum(['number', 'compact', 'cents', 'percent']).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')
      .optional(),
    labels: z.array(text(60)).min(1).max(CHART_MAX_POINTS),
    series: z
      .array(
        z.strictObject({
          label: text(60),
          values: z.array(z.number().finite().nullable()).max(CHART_MAX_POINTS),
        })
      )
      .min(1)
      .max(CHART_MAX_SERIES),
  })
  .superRefine((spec, ctx) => {
    spec.series.forEach((s, i) => {
      if (s.values.length !== spec.labels.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['series', i, 'values'],
          message: `Needs one value per label (${spec.labels.length})`,
        });
      }
    });
    if (PART_WHOLE.has(spec.kind)) {
      if (spec.series.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['series'],
          message: `A ${spec.kind} chart takes exactly one series`,
        });
      }
      if (spec.series[0]?.values.some((v) => v === null || v < 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['series', 0, 'values'],
          message: `A ${spec.kind} chart needs non-negative numbers`,
        });
      }
    }
  }) satisfies z.ZodType<AiChartSpec>;

export type ChartSpecResult = { ok: true; spec: AiChartSpec } | { ok: false; error: string };

/** Reads a fence body: JSON, then the schema. The error is short and safe to show as text. */
export function parseChartSpec(raw: string): ChartSpecResult {
  if (raw.length > CHART_SPEC_MAX_LENGTH)
    return { ok: false, error: 'The chart data is too large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'The chart data is not valid JSON' };
  }
  const parsed = ChartSpecSchema.safeParse(json);
  if (parsed.success) return { ok: true, spec: parsed.data as AiChartSpec };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, error: `${where}${issue?.message ?? 'Invalid chart'}`.slice(0, 200) };
}

/** A ```` ```chart ```` fence for a response pack; throws on an invalid spec so packs fail in tests. */
export function chartBlock(spec: AiChartSpec): string {
  const parsed = ChartSpecSchema.parse(spec);
  return `\`\`\`chart\n${JSON.stringify(parsed)}\n\`\`\``;
}
