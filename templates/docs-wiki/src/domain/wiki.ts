import { buildTree, isWithin, type TreeIndex } from '@protoyard/views/tree';
import type { Page } from '../database/schema.ts';

/**
 * Pure wiki rules, shared by the services, the screens and the generator:
 * the page tree, plain text from Markdown, and full-text search with
 * highlight ranges (rendered as text segments, never as HTML).
 */

export const pageTree = (pages: readonly Page[]): TreeIndex<Page> =>
  buildTree(pages, { id: (p) => p.id, parentId: (p) => p.parentId, rank: (p) => p.rank });

/** True when moving `id` under `parentId` would put a page inside itself. */
export const wouldCycle = (tree: TreeIndex<Page>, id: string, parentId: string | null) =>
  parentId !== null && isWithin(tree, id, parentId);

/** Every descendant id of `id` (not including it). */
export function descendants(tree: TreeIndex<Page>, id: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const child of tree.children.get(at) ?? []) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/**
 * Markdown to plain text for search and snippets: drops code fences' markers,
 * link and image targets, emphasis markers, headings and list bullets. Any
 * HTML in the source stays as literal text, as the preview shows it.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower-cased words of at least two characters. */
export const terms = (query: string) =>
  [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2)
    ),
  ].slice(0, 8);

export type Segment = { text: string; match: boolean };
export type SearchHit = {
  page: Page;
  score: number;
  /** The title split into matching and non-matching segments. */
  title: Segment[];
  /** About 160 characters around the first body match, as segments. */
  snippet: Segment[];
};

/** Splits `text` into segments, marking every occurrence of any term (case-insensitive). */
export function highlight(text: string, words: readonly string[]): Segment[] {
  if (words.length === 0 || !text) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let at = lower.indexOf(w); at !== -1; at = lower.indexOf(w, at + w.length)) {
      ranges.push([at, at + w.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    if (start > cursor) out.push({ text: text.slice(cursor, start), match: false });
    out.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), match: false });
  return out;
}

const count = (haystack: string, word: string) => {
  let n = 0;
  for (let at = haystack.indexOf(word); at !== -1; at = haystack.indexOf(word, at + word.length))
    n++;
  return n;
};

/**
 * Full-text search: every term must appear in the title or the body. Title
 * hits weigh five times body hits; ties go to the most recently updated page.
 */
export function searchPages(
  pages: readonly Page[],
  query: string,
  options: { spaceId?: string; limit?: number } = {}
): SearchHit[] {
  const words = terms(query);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const page of pages) {
    if (options.spaceId && page.spaceId !== options.spaceId) continue;
    const title = page.title.toLowerCase();
    const text = plainText(page.body);
    const body = text.toLowerCase();
    let score = 0;
    let all = true;
    for (const w of words) {
      const inTitle = count(title, w);
      const inBody = count(body, w);
      if (inTitle + inBody === 0) {
        all = false;
        break;
      }
      score += inTitle * 5 + inBody;
    }
    if (!all) continue;
    const first = Math.min(...words.map((w) => body.indexOf(w)).filter((i) => i >= 0), text.length);
    const from = Math.max(0, first - 60);
    const excerpt = `${from > 0 ? '…' : ''}${text.slice(from, from + 160)}${from + 160 < text.length ? '…' : ''}`;
    hits.push({
      page,
      score,
      title: highlight(page.title, words),
      snippet: highlight(excerpt, words),
    });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.page.updatedAt.localeCompare(a.page.updatedAt))
    .slice(0, options.limit ?? 50);
}

/** A line-based change summary between two bodies: lines added and removed (multiset). */
export function lineChanges(before: string, after: string): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const line of before.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split('\n')) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of counts.values()) removed += n;
  return { added, removed };
}
