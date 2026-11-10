import type { Post, ReactionKind } from '../database/schema.ts';

/**
 * Pure feed rules shared by screens and tests: which posts a timeline shows
 * and who a post mentions. Windowing is Texuli's `VirtualListView`.
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

/** "@handle" mentions in plain text (used to notify; rendering stays plain text). */
export const mentionsIn = (text: string) => [
  ...new Set(
    [...text.matchAll(/(^|\s)@([a-z0-9_]{2,24})\b/gi)].map((m) => (m[2] as string).toLowerCase())
  ),
];
