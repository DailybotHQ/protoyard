// @vitest-environment node
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewComment } from '@protoyard/core/review';
import { describe, expect, it } from 'vitest';
import { createFileCommentsStore } from '../src/lib/quick/comments-store.ts';
import { createWorkspace } from './helpers.ts';

const comment = (slug: string): ReviewComment =>
  ({
    formatVersion: 1,
    id: 'comment-00001',
    threadId: 'comment-00001',
    slug,
    body: 'The total looks off on this card.',
    author: { name: 'Riley Reviewer', clientId: 'client-reviewer-1' },
    createdAt: '2026-10-19T10:00:00.000Z',
    anchor: {
      route: { pattern: '/deals/:id', path: '/deals/7' },
      locators: [{ kind: 'py-anchor', value: 'deal-total' }],
      fingerprint: '$12,000',
      offset: { x: 0.5, y: 0.25 },
    },
    context: { scenario: 'busy-quarter', viewport: { width: 1280, height: 800 } },
  }) as ReviewComment;

describe('quick serve file-backed review store', () => {
  it('persists validated comments and reloads them for the next server process', async () => {
    const ws = createWorkspace();
    try {
      const dir = join(ws.root, '.protoyard', 'quick', 'board');
      mkdirSync(dir, { recursive: true });
      await createFileCommentsStore(dir, ['board']).put(comment('board'));

      const reopened = createFileCommentsStore(dir, ['board']);
      expect(await reopened.list('board')).toMatchObject([{ id: 'comment-00001', slug: 'board' }]);
      expect(await reopened.summary('board')).toMatchObject({ total: 1, threads: 1, open: 1 });
      expect(await reopened.list('other-board')).toEqual([]);
      await reopened.remove('board', 'comment-00001');
      expect(await createFileCommentsStore(dir, ['board']).list('board')).toEqual([]);
    } finally {
      ws.cleanup();
    }
  });

  it('refuses a symbolic link at the review storage boundary', async () => {
    const ws = createWorkspace();
    try {
      const dir = join(ws.root, '.protoyard', 'quick', 'board');
      const outside = join(ws.root, 'outside');
      mkdirSync(dir, { recursive: true });
      mkdirSync(outside, { recursive: true });
      symlinkSync(outside, join(dir, 'review'), 'dir');

      await expect(createFileCommentsStore(dir, ['board']).put(comment('board'))).rejects.toThrow(
        /symbolic link/
      );
    } finally {
      ws.cleanup();
    }
  });
});
