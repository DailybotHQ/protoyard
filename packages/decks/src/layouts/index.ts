/**
 * `@protoyard/decks/layouts`: the 21-entry deck layout catalog for agents,
 * lint and the brief synthesizer. The catalog is the deck model's
 * (`DECK_LAYOUTS` in `@texuli/deck/model`: ids, props schemas, limits,
 * `useWhen`/`dontUseWhen`, pacing and steppable paths); this module gives it
 * Protoyard's shape: a list of entries whose `propsSchema` is the layout's
 * JSON Schema (draft 2020-12) and whose `sample` uses local media, so every
 * sample passes Protoyard's offline media policy.
 */

import { BlockListSchema, ChartSpecSchema, LinkHrefSchema } from '@protoyard/blocks';
import {
  type DeckCatalogLayoutId,
  type DeckLayoutCatalogEntry,
  type LayoutPacing,
  layoutPropsSchema,
  DECK_LAYOUT_IDS as MODEL_LAYOUT_IDS,
  DECK_LAYOUTS as MODEL_LAYOUTS,
  validateLayoutProps,
} from '@texuli/deck/model';
import { toJsonSchema } from '@texuli/deck/schema';
import { z } from 'zod';
import { toTexuliDeck } from '../texuli.ts';

import { stripStepMarkers } from './props.ts';

export { LAYOUT_PACING, type LayoutPacing, steppablePattern } from '@texuli/deck/model';
export {
  DECK_LAYOUT_STEPPABLE,
  isSteppablePropPath,
  stepMarkersOutsideLayout,
} from './steppable.ts';
export { stripStepMarkers };

/** Per-layout size caps (counts, not canvas pixels). */
export interface LayoutLimits {
  /** Human-readable limit lines for agents and docs. */
  summary: readonly string[];
}

/** One entry in the deck layout catalog (read-only data). */
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
  /** The props JSON Schema (draft 2020-12); `free` describes its `blocks` list. */
  propsSchema: Record<string, unknown>;
  /** A minimal valid sample (fictional data, local media). */
  sample: TProps;
}

export type DeckLayoutId = (typeof MODEL_LAYOUT_IDS)[number];

const REMOTE_MEDIA = 'https://example.com/media/';

/** The model samples name example.com media; Protoyard decks are offline, so they use `assets/`. */
function localMedia<T>(value: T): T {
  if (typeof value === 'string') {
    return (
      value.startsWith(REMOTE_MEDIA) ? `assets/${value.slice(REMOTE_MEDIA.length)}` : value
    ) as T;
  }
  if (Array.isArray(value)) return value.map(localMedia) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, localMedia(item)])
    ) as T;
  }
  return value;
}

const FREE_SAMPLE = Object.freeze({
  blocks: [
    { type: 'heading', text: 'A free slide', level: 2 },
    { type: 'text', markdown: 'Compose any **@protoyard/blocks** content when no layout fits.' },
  ],
});

/**
 * The `chart` layout keeps Protoyard's chart vocabulary (`ChartSpec`: kind,
 * labels, series values), the one its blocks, brief synthesizer and agents
 * write; migration turns it into the deck model's chart block for the stage.
 */
const ChartLayoutPropsSchema = z.strictObject({
  title: z.string().trim().min(1).max(120).optional(),
  spec: ChartSpecSchema,
  height: z.enum(['sm', 'md', 'lg']).optional(),
  showTable: z.boolean().optional(),
});

const CHART_SAMPLE = Object.freeze({
  title: 'Signups',
  spec: {
    kind: 'bar' as const,
    title: 'Signups by month',
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ label: 'Signups', values: [120, 180, 240] }],
  },
  height: 'md' as const,
  showTable: true,
});

/** A JSON Schema built on first read: renderers and lint never pay for the conversion. */
function lazySchema(build: () => Record<string, unknown>): () => Record<string, unknown> {
  let cached: Record<string, unknown> | undefined;
  return () => {
    cached ??= build();
    return cached;
  };
}

function entry(model: DeckLayoutCatalogEntry): DeckLayoutEntry {
  const isChart = model.id === 'chart';
  const schema = lazySchema(() => {
    if (isChart) {
      return z.toJSONSchema(ChartLayoutPropsSchema, { io: 'input', unrepresentable: 'any' });
    }
    const props = model.kind === 'props' ? layoutPropsSchema(model.id) : undefined;
    return props
      ? toJsonSchema(props)
      : {
          type: 'object',
          description: 'A free slide: `blocks`, a list of @protoyard/blocks content.',
          properties: { blocks: { type: 'array', minItems: 1, maxItems: 48 } },
          required: ['blocks'],
        };
  });
  return Object.freeze({
    id: model.id,
    label: model.label,
    description: isChart
      ? 'A real chart from a bounded ChartSpec (line, area, bar, donut, pie, funnel…).'
      : model.description,
    useWhen: model.useWhen,
    dontUseWhen: model.dontUseWhen,
    pacing: model.pacing,
    limits: model.limits,
    get propsSchema() {
      return schema();
    },
    sample: isChart
      ? CHART_SAMPLE
      : model.kind === 'props'
        ? localMedia(model.sample)
        : FREE_SAMPLE,
  });
}

/** The catalog, in order: 20 layouts with strict props, then `free`. */
export const DECK_LAYOUTS: readonly DeckLayoutEntry[] = Object.freeze(
  MODEL_LAYOUT_IDS.map((id) => entry(MODEL_LAYOUTS[id]))
);

export const DECK_LAYOUT_BY_ID: Readonly<Record<string, DeckLayoutEntry>> = Object.freeze(
  Object.fromEntries(DECK_LAYOUTS.map((layout) => [layout.id, layout]))
);

export const DECK_LAYOUT_IDS: readonly string[] = Object.freeze(DECK_LAYOUTS.map((l) => l.id));

export function getDeckLayout(id: string): DeckLayoutEntry | undefined {
  // Own keys only: an untrusted id such as `constructor` must never resolve through the prototype.
  return Object.hasOwn(DECK_LAYOUT_BY_ID, id) ? DECK_LAYOUT_BY_ID[id] : undefined;
}

export type LayoutPropsIssue = {
  path: (string | number)[];
  message: string;
  /** The deck model's diagnostic code (`too-many`, `required`, `unknown-key`…), when it has one. */
  code?: string;
};

/**
 * Validate props for a known layout id with the deck model's schema (step
 * markers removed first). A legacy Protoyard chart spec is converted as the
 * deck migration converts it. Unknown ids fail with a stable message.
 */
export function parseLayoutProps(
  id: string,
  props: unknown
):
  | { success: true; data: unknown; issues: [] }
  | { success: false; data: null; issues: LayoutPropsIssue[] } {
  if (id === 'free') return parseFreeProps(props);
  if (!getDeckLayout(id)) {
    return {
      success: false,
      data: null,
      issues: [
        {
          path: ['layout'],
          message: `Unknown layout "${id}". Use one of: ${DECK_LAYOUT_IDS.filter((l) => l !== 'free').join(', ')}.`,
        },
      ],
    };
  }
  let input = stripStepMarkers(props);
  if (id === 'chart') {
    const migrated = toTexuliDeck({
      style: {},
      slides: [{ id: 'chart', layout: id, props: input }],
    });
    input = (migrated.slides[0] as { props?: unknown } | undefined)?.props ?? input;
  }
  const result = validateLayoutProps(id as DeckCatalogLayoutId, input);
  // Links follow Protoyard's link policy (http(s), mailto, #anchor, the deck's own
  // `#/<slide-id>/<step>` routes or a relative path), not the model's stricter syntax.
  const issues: LayoutPropsIssue[] = [
    ...result.issues
      .filter((issue) => issue.severity === 'error' && issue.path[issue.path.length - 1] !== 'href')
      .map((issue) => ({ path: [...issue.path], message: issue.message, code: issue.code })),
    ...hrefIssues(input, []),
  ];
  if (issues.length === 0) {
    return { success: true, data: result.ok ? result.value : input, issues: [] };
  }
  return { success: false, data: null, issues };
}

function hrefIssues(value: unknown, path: (string | number)[]): LayoutPropsIssue[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => hrefIssues(item, [...path, index]));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    key === 'href' && typeof child === 'string'
      ? LinkHrefSchema.safeParse(child).success
        ? []
        : [{ path: [...path, key], message: 'Use an http(s), mailto, #anchor or relative link' }]
      : hrefIssues(child, [...path, key])
  );
}

/** A free slide's `{ blocks }`: a list of `@protoyard/blocks` content. */
function parseFreeProps(
  props: unknown
):
  | { success: true; data: unknown; issues: [] }
  | { success: false; data: null; issues: LayoutPropsIssue[] } {
  const record =
    props !== null && typeof props === 'object' && !Array.isArray(props)
      ? (props as Record<string, unknown>)
      : {};
  const extra = Object.keys(record).filter((key) => key !== 'blocks');
  const parsed = BlockListSchema.min(1).max(48).safeParse(record.blocks);
  const issues: LayoutPropsIssue[] = [
    ...extra.map((key) => ({ path: [key], message: `Unknown key "${key}".` })),
    ...(parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({
          path: ['blocks', ...(issue.path as (string | number)[])],
          message: issue.message,
        }))),
  ];
  return issues.length === 0 && parsed.success
    ? { success: true, data: { blocks: parsed.data }, issues: [] }
    : { success: false, data: null, issues };
}

/** Agent-readable summary of every layout (id, when to use, limits). */
export function describeLayouts(): string {
  const lines = [
    'Deck layout catalog (@protoyard/decks/layouts, from @texuli/deck)',
    `${DECK_LAYOUTS.length} layouts: 19 content primitives + chart + free.`,
    '',
  ];
  for (const layout of DECK_LAYOUTS) {
    lines.push(`## ${layout.id} — ${layout.label}`);
    lines.push(layout.description);
    lines.push(`Pacing: ${layout.pacing.join(', ')}`);
    lines.push('Use when:');
    for (const item of layout.useWhen) lines.push(`- ${item}`);
    lines.push("Don't use when:");
    for (const item of layout.dontUseWhen) lines.push(`- ${item}`);
    lines.push('Limits:');
    for (const item of layout.limits.summary) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}
