import type { ContentKind } from './kind.ts';

/**
 * Untrusted-input rules for content-kind blueprints (deck, page, doc;
 * ADR-036): size caps checked before any schema runs, the multiline string
 * allowlist, and the embedded-app walk. Pure and dependency-free on purpose:
 * the untrusted loader sits on the player's first screen, and importing the
 * block or deck engines here would put them there for every app.
 *
 * The multiline allowlist is a fixed set of schema field names (the block
 * engine's markdown fields, list item text, code blocks, deck layout code,
 * speaker notes). It is never
 * read from the data: a document can only use the fields the schemas define.
 */

export interface UntrustedDocumentLimits {
  /** Serialized UTF-8 bytes of a content document (media data URIs count). */
  maxBytes: number;
  /** JSON nesting depth. */
  maxDepth: number;
  /** Slides in a deck. */
  maxSlides: number;
  /** Blocks in one slide (nested container blocks included). */
  maxBlocksPerSlide: number;
  /** Blocks in the whole document (nested container blocks included). */
  maxBlocks: number;
  /** Chart data points (labels × series) across every chart block. */
  maxChartPoints: number;
  /** `embed-app` blocks in the document. */
  maxEmbeddedApps: number;
}

export const DEFAULT_UNTRUSTED_DOCUMENT_LIMITS: Readonly<UntrustedDocumentLimits> = Object.freeze({
  // Matches the block engine's guard (BLOCK_LIMITS.maxBytes): room for the
  // 512 KB of raster data URIs a document may carry.
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  // The deck schema's own caps (DECK_LIMITS.slides) and the block engine's
  // document cap (BLOCK_LIMITS.maxBlocks).
  maxSlides: 200,
  maxBlocksPerSlide: 200,
  maxBlocks: 2_000,
  // Eight full charts (366 labels × 8 series is one chart's schema maximum).
  maxChartPoints: 8 * 366 * 8,
  maxEmbeddedApps: 8,
});

/** How a string value is cleaned: controls stripped, newlines kept, or newlines and tabs kept. */
export type TextContext = 'plain' | 'multiline' | 'code';

/** Block fields that hold markdown or multi-line prose (mirrors the block engine's guard). */
const MULTILINE_FIELDS: ReadonlySet<string> = new Set([
  'markdown',
  'quote',
  'body',
  'prompt',
  'explanation',
  'description',
]);

/**
 * The text context of `key` inside `record` (its parent object). Speaker
 * notes and the block markdown fields keep newlines. Code keeps tabs too: a
 * `code` block's `code`, and a deck layout's code object (`{ lang, source }`,
 * the `code-with-callout` layout's `props.code`). List item text is markdown,
 * and every other string (titles, labels, ids, a big stat's `source` caption)
 * stays one line.
 */
export function textContextFor(
  key: string,
  record: Readonly<Record<string, unknown>>,
  inListItems: boolean
): TextContext {
  if (key === 'code' && record.type === 'code') return 'code';
  if (key === 'source' && typeof record.lang === 'string') return 'code';
  if (key === 'notes' && typeof record.id === 'string') return 'multiline';
  if (MULTILINE_FIELDS.has(key)) return 'multiline';
  if (inListItems && key === 'text') return 'multiline';
  return 'plain';
}

export interface ContentLimitIssue {
  path: (string | number)[];
  message: string;
  fix: string;
}

export interface EmbeddedApp {
  path: (string | number)[];
  app: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Blocks directly in `value` when it is a block list (`blocks` arrays, `columns` cells). */
function* blockLists(
  record: Record<string, unknown>,
  path: (string | number)[]
): Generator<{ list: unknown[]; path: (string | number)[] }> {
  if (Array.isArray(record.blocks)) yield { list: record.blocks, path: [...path, 'blocks'] };
  if (record.type === 'columns' && Array.isArray(record.columns)) {
    for (const [i, column] of record.columns.entries()) {
      if (Array.isArray(column)) yield { list: column, path: [...path, 'columns', i] };
    }
  }
  if (record.type === 'tabs' && Array.isArray(record.panels)) {
    for (const [i, panel] of record.panels.entries()) {
      if (isRecord(panel) && Array.isArray(panel.blocks)) {
        yield { list: panel.blocks, path: [...path, 'panels', i, 'blocks'] };
      }
    }
  }
}

/**
 * Walks a sanitized content document and checks the caps the schemas do not
 * express across the whole document: slide count, blocks per slide and in
 * total (nested container blocks count), chart points and embedded apps. It
 * returns the first problem, or the embedded apps to validate next.
 */
export function checkContentLimits(
  root: Readonly<Record<string, unknown>>,
  kind: ContentKind,
  limits: UntrustedDocumentLimits
): { issue: ContentLimitIssue } | { issue: null; embeddedApps: EmbeddedApp[] } {
  const body = root[kind];
  if (!isRecord(body)) return { issue: null, embeddedApps: [] };
  const tooMany = (path: (string | number)[], what: string, actual: number, max: number) => ({
    issue: {
      path,
      message: `This ${kind} has ${actual} ${what}; the limit is ${max}.`,
      fix: `Reduce it to at most ${max} ${what}.`,
    },
  });

  if (kind === 'deck' && Array.isArray(body.slides) && body.slides.length > limits.maxSlides) {
    return tooMany([kind, 'slides'], 'slides', body.slides.length, limits.maxSlides);
  }

  let total = 0;
  let chartPoints = 0;
  const embeddedApps: EmbeddedApp[] = [];
  // Each block list is counted against its slide (decks) and the document.
  const walkList = (
    list: unknown[],
    path: (string | number)[],
    slide: { count: number; path: (string | number)[] } | null
  ): ContentLimitIssue | null => {
    for (const [index, value] of list.entries()) {
      if (!isRecord(value)) continue;
      const blockPath = [...path, index];
      total += 1;
      if (total > limits.maxBlocks) {
        return tooMany(blockPath, 'blocks', total, limits.maxBlocks).issue;
      }
      if (slide) {
        slide.count += 1;
        if (slide.count > limits.maxBlocksPerSlide) {
          return {
            path: blockPath,
            message: `A slide has more than ${limits.maxBlocksPerSlide} blocks.`,
            fix: `Split the slide or keep it to at most ${limits.maxBlocksPerSlide} blocks.`,
          };
        }
      }
      if ((value.type === 'chart' || value.type === 'chart-controls') && isRecord(value.spec)) {
        const labels = Array.isArray(value.spec.labels) ? value.spec.labels.length : 0;
        const series = Array.isArray(value.spec.series) ? value.spec.series.length : 0;
        chartPoints += labels * Math.max(1, series);
        if (chartPoints > limits.maxChartPoints) {
          return tooMany([...blockPath, 'spec'], 'chart points', chartPoints, limits.maxChartPoints)
            .issue;
        }
      }
      if (value.type === 'embed-app') {
        embeddedApps.push({ path: [...blockPath, 'app'], app: value.app });
        if (embeddedApps.length > limits.maxEmbeddedApps) {
          return tooMany(blockPath, 'embedded apps', embeddedApps.length, limits.maxEmbeddedApps)
            .issue;
        }
      }
      for (const nested of blockLists(value, blockPath)) {
        const problem = walkList(nested.list, nested.path, slide);
        if (problem) return problem;
      }
    }
    return null;
  };

  // A catalog `chart` slide carries its spec in props: it counts against the same
  // document chart-point budget as chart blocks, or a deck of chart slides
  // could ask a viewer's browser to draw far more than the limit allows.
  if (kind === 'deck' && Array.isArray(body.slides)) {
    for (const [i, slide] of body.slides.entries()) {
      if (!isRecord(slide) || !isRecord(slide.props) || !isRecord(slide.props.spec)) continue;
      const spec = slide.props.spec;
      const labels = Array.isArray(spec.labels) ? spec.labels.length : 0;
      const series = Array.isArray(spec.series) ? spec.series.length : 0;
      chartPoints += labels * Math.max(1, series);
      if (chartPoints > limits.maxChartPoints) {
        return tooMany(
          [kind, 'slides', i, 'props', 'spec'],
          'chart points',
          chartPoints,
          limits.maxChartPoints
        );
      }
    }
  }

  const lists: { list: unknown[]; path: (string | number)[]; slide: boolean }[] = [];
  if (kind === 'deck' && Array.isArray(body.slides)) {
    for (const [i, slide] of body.slides.entries()) {
      if (isRecord(slide) && Array.isArray(slide.blocks)) {
        lists.push({ list: slide.blocks, path: [kind, 'slides', i, 'blocks'], slide: true });
      }
    }
  } else if (kind === 'page' && Array.isArray(body.sections)) {
    for (const [i, section] of body.sections.entries()) {
      if (isRecord(section) && Array.isArray(section.blocks)) {
        lists.push({ list: section.blocks, path: [kind, 'sections', i, 'blocks'], slide: false });
      }
    }
  } else if (Array.isArray(body.blocks)) {
    lists.push({ list: body.blocks, path: [kind, 'blocks'], slide: false });
  }
  for (const { list, path, slide } of lists) {
    const problem = walkList(list, path, slide ? { count: 0, path } : null);
    if (problem) return { issue: problem };
  }
  return { issue: null, embeddedApps };
}

/** Whether `value` holds an `embed-app` block anywhere (embedded apps may not embed again). */
export function containsEmbeddedApp(value: unknown): boolean {
  const stack: unknown[] = [value];
  let seen = 0;
  while (stack.length > 0 && seen < 100_000) {
    const node = stack.pop();
    seen += 1;
    if (Array.isArray(node)) stack.push(...node);
    else if (isRecord(node)) {
      if (node.type === 'embed-app') return true;
      for (const key of Object.keys(node)) stack.push(node[key]);
    }
  }
  // Fail closed: a value too large to finish scanning is treated as nested.
  return stack.length > 0;
}
