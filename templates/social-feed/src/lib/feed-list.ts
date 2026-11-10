import type { Post } from '../database/schema.ts';

/** The id of a post's author line: it names the post's feed article. */
export const postLabelId = (postId: string): string => `post-${postId}-author`;

/**
 * The props both windowed post lists (Feed, Profile) pass to `VirtualListView`:
 * the APG feed pattern with no selection, no box around the cards (the feed
 * runs edge to edge; each card draws its own divider), and each `<article>`
 * named by its post's author line through `aria-labelledby`.
 */
export const POST_FEED = {
  mode: 'feed',
  selectable: false,
  surface: 'plain',
  getRowLabelId: (post: Post) => postLabelId(post.id),
} as const;
