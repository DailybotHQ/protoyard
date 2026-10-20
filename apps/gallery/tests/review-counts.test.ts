// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ReviewComment, ReviewCommentSchema } from '@protoyard/core/review';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attachReviewCounts,
  readRegistry,
  readReviewCounts,
} from '../src/integrations/registry-plugin.mjs';

const root = mkdtempSync(join(tmpdir(), 'gallery-review-counts-'));
const pulledAt = '2026-10-19T12:00:00.000Z';
const reviewer = { name: 'Alex Reviewer', clientId: 'client_12345678' };
const anchor: ReviewComment['anchor'] = {
  route: { pattern: '/', path: '/' },
  locators: [{ kind: 'id', value: 'main-title' }],
  offset: { x: 0.5, y: 0.5 },
};

function comment(id: string, resolved = false): ReviewComment {
  return ReviewCommentSchema.parse({
    formatVersion: 1,
    id,
    threadId: id,
    slug: 'gallery-demo',
    body: 'Please review this screen.',
    author: reviewer,
    createdAt: '2026-10-18T12:00:00.000Z',
    ...(resolved ? { resolvedAt: '2026-10-19T11:00:00.000Z', resolvedBy: reviewer } : {}),
    anchor,
    context: { viewport: { width: 1280, height: 800 } },
  });
}

function pulled(slug = 'gallery-demo') {
  return {
    format: 'protoyard-review-comments',
    version: 1,
    namespace: 'gallery-demo',
    slug,
    pulledAt,
    comments: [
      comment('thread_open_12345'),
      { ...comment('reply_open_12345'), threadId: 'thread_open_12345' },
      comment('thread_done_12345', true),
    ],
  };
}

function writePulled(value: unknown) {
  const dir = join(root, 'artifacts', 'review-comments', 'comments');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'gallery-demo.json'), JSON.stringify(value));
}

beforeEach(() => rmSync(join(root, 'artifacts'), { recursive: true, force: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('gallery review counts', () => {
  it('adds validated pulled counts to prototype registry entries only', () => {
    writePulled(pulled());
    const entries = attachReviewCounts(root, [
      { kind: 'prototype', slug: 'gallery-demo' },
      { kind: 'template', slug: 'gallery-demo' },
    ]);
    expect(entries).toEqual([
      {
        kind: 'prototype',
        slug: 'gallery-demo',
        reviewCounts: { open: 1, resolved: 1, pulledAt },
      },
      { kind: 'template', slug: 'gallery-demo' },
    ]);
    expect(readReviewCounts(root, 'gallery-demo')).toEqual({ open: 1, resolved: 1, pulledAt });
  });

  it('carries counts into the gallery registry consumed at build time', () => {
    writePulled(pulled());
    const state = join(root, '.protoyard');
    mkdirSync(state, { recursive: true });
    const registryPath = join(state, 'registry.json');
    writeFileSync(
      registryPath,
      JSON.stringify({
        format: 'protoyard.registry',
        entries: [{ kind: 'prototype', slug: 'gallery-demo', path: 'prototypes/gallery-demo' }],
      })
    );
    expect(readRegistry(registryPath).registry?.entries[0]?.reviewCounts).toEqual({
      open: 1,
      resolved: 1,
      pulledAt,
    });
  });

  it('omits counts when a pulled file is missing or invalid', () => {
    expect(readReviewCounts(root, 'gallery-demo')).toBeNull();
    writePulled({ ...pulled(), slug: 'another-demo' });
    expect(attachReviewCounts(root, [{ kind: 'prototype', slug: 'gallery-demo' }])).toEqual([
      { kind: 'prototype', slug: 'gallery-demo' },
    ]);
  });
});
