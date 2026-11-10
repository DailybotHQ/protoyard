import { VirtualListView } from '@protoyard/ui';
import { type Component, createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Post } from '../src/database/schema.ts';
import { POST_FEED, postLabelId } from '../src/lib/feed-list.ts';

/**
 * The windowed post lists (Feed, Profile) pass POST_FEED to Texuli's
 * VirtualListView: a feed without the box around it, whose articles are named
 * by each post's author line (the row renders it with `postLabelId`, as
 * PostCard does).
 */
const posts = ['post_0001', 'post_0002', 'post_0003'].map(
  (id) => ({ id, authorId: 'user_0001', text: `Post ${id}` }) as unknown as Post
);

const row = createRawSnippet<[{ item: Post }]>((context) => ({
  render: () => {
    const { item } = context();
    return `<div><p id="${postLabelId(item.id)}">Rae Example @rae</p><button type="button">Like</button></div>`;
  },
}));

/** `mount` cannot infer a generic component's row type; the props below are Post-typed. */
const FeedList = VirtualListView as unknown as Component<Record<string, unknown>>;

let app: ReturnType<typeof mount> | undefined;
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.replaceChildren();
});

describe('post feed list', () => {
  it('names each article by its author line and drops the box around the feed', () => {
    app = mount(FeedList, {
      target: document.body,
      props: {
        ...POST_FEED,
        items: posts,
        label: 'Everyone timeline',
        row,
        getKey: (p: Post) => p.id,
      },
    });
    flushSync();
    const root = document.querySelector<HTMLElement>('[data-tx-component="data-virtual-list"]');
    expect(root?.dataset.txSurface).toBe('plain');
    expect(root?.classList.contains('tx-virtual-list--plain')).toBe(true);
    expect(document.querySelector('[role="feed"]')?.getAttribute('aria-label')).toBe(
      'Everyone timeline'
    );
    const articles = [...document.querySelectorAll('article')];
    expect(articles.length).toBeGreaterThan(0);
    for (const [index, article] of articles.entries()) {
      const id = postLabelId((posts[index] as Post).id);
      expect(article.getAttribute('aria-labelledby')).toBe(id);
      expect(article.hasAttribute('aria-label')).toBe(false);
      expect(article.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});
