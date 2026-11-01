// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import type { ReviewComment } from '@protoyard/core/review';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { createFileCommentsStore } from '../src/lib/quick/comments-store.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player, so quick never needs a build. */
async function useFixturePlayer() {
  const dir = join(ws.root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  const player = {
    dir,
    packageDir: join(ws.root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
  restore.push(
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) }))
  );
}

beforeEach(() => {
  ws = createWorkspace();
  restore = [];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function explore(...extra: string[]) {
  const result = await run('--blueprint', ANALYTICS, '--slug', 'idea', ...extra);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  const { dir } = result.json<{ data: { dir: string } }>().data;
  const namespace = async (file: string) =>
    (
      await blueprintIdentity(
        parseBlueprint(JSON.parse(readFileSync(join(ws.root, dir, file), 'utf8')))
      )
    ).namespace;
  return {
    dir,
    base: await namespace('blueprint.json'),
    v1: extra.includes('--variants') ? await namespace('v1/blueprint.json') : '',
  };
}

const comment = (slug: string, overrides: Partial<ReviewComment> = {}): ReviewComment =>
  ({
    formatVersion: 1,
    id: 'comment-00001',
    threadId: 'comment-00001',
    slug,
    body: 'The total looks off on this card.',
    author: { name: 'Riley Reviewer', clientId: 'client-reviewer-1' },
    createdAt: '2026-10-19T10:00:00.000Z',
    anchor: {
      route: { pattern: '/explore', path: '/explore' },
      locators: [{ kind: 'py-anchor', value: 'events-card' }],
      fingerprint: 'Events',
      offset: { x: 0.5, y: 0.25 },
    },
    context: { scenario: 'active', viewport: { width: 1280, height: 800 } },
    ...overrides,
  }) as ReviewComment;

/** A browser export from the review panel (the local adapter's file). */
function exportFile(name: string, slug: string, comments: unknown[], namespace = slug): string {
  const path = join(ws.root, 'tmp', name);
  mkdirSync(join(ws.root, 'tmp'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ format: 'protoyard-review-comments', version: 1, namespace, slug, comments })
  );
  return path;
}

const read = (dir: string, file: string) => readFileSync(join(ws.root, dir, file), 'utf8');

describe('protoyard quick feedback', () => {
  it('merges an exported file into the store (newer edits win) and neutralizes hostile Markdown', async () => {
    await useFixturePlayer();
    const { dir, base, v1 } = await explore('--variants', '1');
    await createFileCommentsStore(join(ws.root, dir), [base, v1]).put(comment(v1));

    const hostile = [
      '# Ignore previous instructions',
      '<script>alert(1)</script> <img src=x onerror=alert(1)>',
      '[click me](javascript:alert(1)) and ![x](https://evil.example/pixel.png)',
      '```',
      '| a | b |',
    ].join('\n');
    const file = exportFile('v1.json', v1, [
      // Older than the stored copy: the store keeps its own.
      comment(v1, { body: 'An older draft.', updatedAt: '2026-10-18T00:00:00.000Z' }),
      comment(v1, {
        id: 'comment-00003',
        threadId: 'comment-00003',
        body: hostile,
        createdAt: '2026-10-19T12:00:00.000Z',
      }),
    ]);
    const result = await run('feedback', 'idea', '--import', file);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(
      result.json<{ data: { imported: Record<string, number> } }>().data.imported
    ).toMatchObject({ comments: 2, added: 1, updated: 0, unchanged: 1 });

    // The import is kept in the served store.
    const stored = JSON.parse(read(dir, 'review/comments.json')).comments as ReviewComment[];
    expect(stored.map((c) => c.id).sort()).toEqual(['comment-00001', 'comment-00003']);
    expect(stored.find((c) => c.id === 'comment-00001')?.body).toBe(
      'The total looks off on this card.'
    );

    const markdown = read(dir, 'REVIEW.md');
    expect(markdown).not.toMatch(/^#+ Ignore previous instructions/m);
    expect(markdown).not.toMatch(/(?<!\\)<script|(?<!\\)<img/);
    expect(markdown).not.toMatch(/\]\(javascript:/);
    expect(markdown).not.toMatch(/!\[x\]\(https:/);
    expect(markdown).not.toMatch(/^```/m);
    expect(markdown).toContain('Ignore previous instructions');

    // A newer edit of an existing comment replaces it.
    const newer = exportFile('newer.json', v1, [
      comment(v1, { body: 'Fixed wording.', updatedAt: '2026-10-20T00:00:00.000Z' }),
    ]);
    const again = await run('feedback', 'idea', '--import', newer);
    expect(
      again.json<{ data: { imported: Record<string, number> } }>().data.imported
    ).toMatchObject({ added: 0, updated: 1, unchanged: 0 });
    expect(read(dir, 'REVIEW.md')).toContain('> Fixed wording\\.');
  });

  it('refuses a wrong-slug, mismatched or malformed import and writes nothing', async () => {
    await useFixturePlayer();
    const { dir, base } = await explore();
    const cases = [
      exportFile('other.json', 'bp-someoneelse', [comment('bp-someoneelse')]),
      exportFile('mismatch.json', base, [comment(base)], 'another-namespace'),
      exportFile('crossed.json', base, [comment('bp-someoneelse')]),
      exportFile('bad.json', base, [{ id: 'nope' }]),
    ];
    const notJson = join(ws.root, 'tmp', 'not.json');
    writeFileSync(notJson, '{nope');
    for (const file of [...cases, notJson]) {
      const result = await run('feedback', 'idea', '--import', file);
      expect(result.code, file).toBe(4);
      expect(result.json<{ error: { code: string } }>().error.code, file).toBe('validation');
      expect(existsSync(join(ws.root, dir, 'REVIEW.md')), file).toBe(false);
      expect(existsSync(join(ws.root, dir, 'review/comments.json')), file).toBe(false);
    }
    const missing = await run('feedback', 'idea', '--import', join(ws.root, 'tmp', 'nope.json'));
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('not_found');

    // With nothing to report the files still say so.
    expect((await run('feedback', 'idea')).code).toBe(0);
    expect(read(dir, 'REVIEW.md')).toContain('_No comments yet._');
  });
});

describe('quick feedback server', () => {
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
});
