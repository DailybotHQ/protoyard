import type { Post, ReactionKind } from '../database/schema.ts';

/**
 * Pure feed rules shared by screens and tests: which posts a timeline shows,
 * and the windowing math the feed uses to render only what is on screen.
 */

export const EMPTY_COUNTS: Record<ReactionKind, number> = { like: 0, celebrate: 0, insightful: 0 };

/** Newest first; ties keep a stable order by id. */
export const byNewest = (a: Post, b: Post) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1;

/** Home: posts by the people you follow and your own. Everyone: every post. */
export function timeline(
  posts: readonly Post[],
  mode: 'home' | 'everyone',
  me: string | null,
  following: ReadonlySet<string>
): Post[] {
  const list =
    mode === 'everyone'
      ? [...posts]
      : posts.filter((p) => p.authorId === me || following.has(p.authorId));
  return list.sort(byNewest);
}

/**
 * The rows to render for a scroll position: items have measured heights (or
 * an estimate until measured); returns the index range plus the space above
 * and below it, so the scroller keeps its full height.
 */
export function feedWindow(options: {
  count: number;
  heightOf: (index: number) => number;
  scrollTop: number;
  viewport: number;
  overscan?: number;
}): { start: number; end: number; before: number; after: number; total: number } {
  const { count, heightOf, scrollTop, viewport } = options;
  const overscan = options.overscan ?? 4;
  let y = 0;
  let start = 0;
  while (start < count && y + heightOf(start) <= scrollTop) {
    y += heightOf(start);
    start++;
  }
  const before = y;
  let end = start;
  while (end < count && y < scrollTop + viewport) {
    y += heightOf(end);
    end++;
  }
  // Overscan: a few rows above and below so fast scrolling never shows a gap.
  const first = Math.max(0, start - overscan);
  let beforeWithOverscan = before;
  for (let i = first; i < start; i++) beforeWithOverscan -= heightOf(i);
  const last = Math.min(count, end + overscan);
  let total = y;
  for (let i = end; i < count; i++) total += heightOf(i);
  let rendered = 0;
  for (let i = first; i < last; i++) rendered += heightOf(i);
  return {
    start: first,
    end: last,
    before: beforeWithOverscan,
    after: total - beforeWithOverscan - rendered,
    total,
  };
}

/** "@handle" mentions in plain text (used to notify; rendering stays plain text). */
export const mentionsIn = (text: string) => [
  ...new Set(
    [...text.matchAll(/(^|\s)@([a-z0-9_]{2,24})\b/gi)].map((m) => (m[2] as string).toLowerCase())
  ),
];
