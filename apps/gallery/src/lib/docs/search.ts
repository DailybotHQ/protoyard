import type { PublicDoc } from './index.ts';

/**
 * Build-time documentation search: one entry per heading of every public
 * guide, served as a static JSON file and searched in the browser. Nothing is
 * sent anywhere; the index holds only published guide text.
 */

export const SEARCH_INDEX_FORMAT = 'protoyard.docs-search';
/** Section text kept per entry; enough for matching and a snippet. */
export const MAX_SECTION_CHARS = 1_500;
const MAX_QUERY_CHARS = 100;
const MAX_TOKENS = 8;

export interface DocsSearchEntry {
  /** Guide slug (`player`). */
  doc: string;
  docTitle: string;
  /** Heading anchor on the guide page. */
  id: string;
  heading: string;
  depth: number;
  /** Page URL with the anchor, base path included. */
  href: string;
  text: string;
}

export interface DocsSearchIndex {
  format: typeof SEARCH_INDEX_FORMAT;
  version: 1;
  entries: DocsSearchEntry[];
}

export interface DocsSearchResult {
  entry: DocsSearchEntry;
  score: number;
  /** Plain text around the first match in the section (rendered as text, never HTML). */
  snippet: string;
}

/** Accent- and case-insensitive form used on both sides of a match. */
export function normalizeText(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The search index for `docs` (from `getPublicDocs(basePath)`). */
export function buildSearchIndex(docs: readonly PublicDoc[], basePath = ''): DocsSearchIndex {
  const base = basePath.replace(/\/$/, '');
  const entries: DocsSearchEntry[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      // The page itself for the title heading; a fragment for every other heading.
      const anchor = section.depth === 1 ? '' : `#${section.id}`;
      entries.push({
        doc: doc.slug,
        docTitle: doc.title,
        id: section.id,
        heading: section.heading,
        depth: section.depth,
        href: `${base}/docs/${doc.slug}/${anchor}`,
        text: section.text.slice(0, MAX_SECTION_CHARS),
      });
    }
  }
  return { format: SEARCH_INDEX_FORMAT, version: 1, entries };
}

/** Query words: normalized, deduplicated, at most 8, from at most 100 characters. */
export function queryTokens(query: string): string[] {
  const words = normalizeText(query.slice(0, MAX_QUERY_CHARS))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

function snippetAround(text: string, tokens: readonly string[], width = 160): string {
  if (!text) return '';
  const lower = normalizeText(text);
  const hits = tokens.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

const startsWord = (haystack: string, token: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(
    haystack
  );

/**
 * Every query word must appear in the heading, the guide title or the section
 * text (AND). Heading matches rank first, then title, then body; word starts
 * and the whole phrase in a heading rank higher. Ties keep guide order.
 */
export function searchDocs(index: DocsSearchIndex, query: string, limit = 12): DocsSearchResult[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(' ');
  const results: DocsSearchResult[] = [];
  index.entries.forEach((entry, order) => {
    const heading = normalizeText(entry.heading);
    const title = normalizeText(entry.docTitle);
    const text = normalizeText(entry.text);
    let score = 0;
    for (const token of tokens) {
      const inHeading = heading.includes(token);
      const inTitle = title.includes(token);
      const inText = text.includes(token);
      if (!inHeading && !inTitle && !inText) return;
      if (inHeading) score += startsWord(heading, token) ? 12 : 8;
      if (inTitle) score += startsWord(title, token) ? 5 : 3;
      if (inText) score += startsWord(text, token) ? 2 : 1;
    }
    if (tokens.length > 1 && heading.includes(phrase)) score += 15;
    else if (tokens.length > 1 && text.includes(phrase)) score += 4;
    results.push({ entry, score: score - order / 1e6, snippet: snippetAround(entry.text, tokens) });
  });
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Validates a fetched index (the page treats it as data, never as code). */
export function isDocsSearchIndex(value: unknown): value is DocsSearchIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as Partial<DocsSearchIndex>;
  return (
    index.format === SEARCH_INDEX_FORMAT &&
    index.version === 1 &&
    Array.isArray(index.entries) &&
    index.entries.every(
      (e) =>
        e &&
        typeof e.doc === 'string' &&
        typeof e.docTitle === 'string' &&
        typeof e.id === 'string' &&
        typeof e.heading === 'string' &&
        typeof e.href === 'string' &&
        e.href.startsWith('/') &&
        !e.href.startsWith('//') &&
        typeof e.text === 'string'
    )
  );
}
