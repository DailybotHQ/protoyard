import { z } from 'zod';

/** A stored comment. Reactions map an emoji to the persona ids that chose it. */
export interface ActivityComment {
  id: string;
  parentId?: string | null;
  authorId: string;
  /** Text with `@{id}` / `#{id}` tokens. */
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: Record<string, readonly string[]>;
}

export interface CommentThreadNode<C extends ActivityComment = ActivityComment> {
  comment: C;
  replies: C[];
}

/** For services: a comment body and where it goes. */
export const CommentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(5000, 'Keep it under 5,000 characters'),
  parentId: z.string().min(1).nullable().default(null),
});
export type CommentInput = z.infer<typeof CommentInputSchema>;

const byTime = (a: ActivityComment, b: ActivityComment) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

/**
 * Root comments oldest first, each with its replies oldest first. A reply to
 * a reply joins the root's thread; a reply whose parent is gone becomes a root.
 * Deleted comments without live replies are left out.
 */
export function buildThreads<C extends ActivityComment>(
  comments: readonly C[]
): CommentThreadNode<C>[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: C): C => {
    let current = c;
    const seen = new Set<string>();
    while (current.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId) as C;
    }
    return current;
  };
  const threads = new Map<string, CommentThreadNode<C>>();
  for (const c of [...comments].sort(byTime)) {
    const root = rootOf(c);
    if (root.id === c.id) {
      if (!threads.has(c.id)) threads.set(c.id, { comment: c, replies: [] });
    } else {
      let thread = threads.get(root.id);
      if (!thread) {
        thread = { comment: root, replies: [] };
        threads.set(root.id, thread);
      }
      if (!c.deletedAt) thread.replies.push(c);
    }
  }
  return [...threads.values()]
    .filter((t) => !t.comment.deletedAt || t.replies.length > 0)
    .sort((a, b) => byTime(a.comment, b.comment));
}

/** Adds or removes `personaId` on one emoji (for a service to save). */
export function toggleReaction(
  reactions: Record<string, readonly string[]> | undefined,
  emoji: string,
  personaId: string
): Record<string, string[]> {
  // A Map plus Object.fromEntries: a stored `__proto__` key (JSON.parse makes it an
  // own property) stays an ordinary key and never reassigns the result's prototype.
  const next = new Map<string, string[]>();
  for (const [key, ids] of Object.entries(reactions ?? {})) next.set(key, [...ids]);
  const ids = next.get(emoji) ?? [];
  const updated = ids.includes(personaId)
    ? ids.filter((id) => id !== personaId)
    : [...ids, personaId];
  if (updated.length === 0) next.delete(emoji);
  else next.set(emoji, updated);
  return Object.fromEntries(next);
}
