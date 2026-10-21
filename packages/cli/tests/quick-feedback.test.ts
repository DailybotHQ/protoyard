// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import type { ReviewComment } from '@protoyard/core/review';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { setQuickServeOpener, setQuickServeStop } from '../src/commands/quick/serve.ts';
import { launchChromium } from '../src/lib/capture/index.ts';
import { findFreePort } from '../src/lib/ports.ts';
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
  it('writes REVIEW.md and REVIEW.json from the served comments, per variant', async () => {
    await useFixturePlayer();
    const { dir, base, v1 } = await explore('--variants', '1');
    const store = createFileCommentsStore(join(ws.root, dir), [base, v1]);
    await store.put(comment(base));
    await store.put(
      comment(base, {
        id: 'comment-00002',
        threadId: 'comment-00001',
        body: 'Agreed, it double counts refunds.',
        anchor: undefined,
        context: undefined,
        createdAt: '2026-10-19T11:00:00.000Z',
      })
    );

    const result = await run('feedback', 'idea');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{
      data: {
        report: string;
        imported: null;
        groups: { variant: string | null; comments: number; threads: number }[];
      };
    }>().data;
    expect(data.report).toBe(`${dir}/REVIEW.md`);
    expect(data.imported).toBeNull();
    expect(data.groups).toEqual([
      { variant: null, earlier: null, namespace: base, comments: 2, threads: 1 },
      { variant: 'v1', earlier: null, namespace: v1, comments: 0, threads: 0 },
    ]);
    const markdown = read(dir, 'REVIEW.md');
    expect(markdown).toMatch(/^# Exploration feedback: /);
    expect(markdown).toContain('Untrusted reviewer text');
    // Bodies are quoted with Markdown punctuation escaped (`.` → `\\.`).
    expect(markdown).toContain('> The total looks off on this card\\.');
    expect(markdown).toContain('> Agreed, it double counts refunds\\.');
    // The shared renderer's headings sit one level below this report's.
    expect(markdown).toContain(`## Base: `);
    expect(markdown).toContain(`### Open`);
    expect(markdown).not.toMatch(/^# Review comments/m);

    const json = JSON.parse(read(dir, 'REVIEW.json'));
    expect(json).toMatchObject({
      format: 'protoyard.quick-feedback',
      formatVersion: 1,
      slug: 'idea',
    });
    expect(json.files[0].file).toMatchObject({
      format: 'protoyard-review-comments',
      version: 1,
      namespace: base,
      slug: base,
    });
    expect(json.files[0].file.comments).toHaveLength(2);
  });

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

  it('keeps comments made before a quick iterate, marked as an earlier version', async () => {
    await useFixturePlayer();
    const { dir, base: before } = await explore();
    // A tab opened before the iterate commented through quick serve under the old namespace.
    await createFileCommentsStore(join(ws.root, dir), [before]).put(comment(before));
    const patch = join(ws.root, 'tmp', 'rename.json');
    mkdirSync(join(ws.root, 'tmp'), { recursive: true });
    writeFileSync(patch, JSON.stringify([{ op: 'replace', path: '/name', value: 'Pulse Board' }]));
    const iterated = await run('iterate', 'idea', '--patch', patch);
    expect(iterated.code, iterated.stderr || iterated.stdout).toBe(0);
    const after = (await blueprintIdentity(parseBlueprint(JSON.parse(read(dir, 'blueprint.json')))))
      .namespace;
    expect(after).not.toBe(before);

    // A foreign file is still refused, and nothing is written.
    const foreign = await run(
      'feedback',
      'idea',
      '--import',
      exportFile('other.json', 'bp-someoneelse', [comment('bp-someoneelse')])
    );
    expect(foreign.code).toBe(4);
    expect(existsSync(join(ws.root, dir, 'REVIEW.md'))).toBe(false);

    // The browser export from the live-reloaded tab carries the earlier namespace too.
    const exported = exportFile('earlier.json', before, [
      comment(before, { id: 'comment-00002', threadId: 'comment-00002', body: 'Second note.' }),
    ]);
    const result = await run('feedback', 'idea', '--import', exported);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{
      data: {
        imported: { added: number };
        groups: { variant: string | null; earlier: number | null; namespace: string }[];
      };
    }>().data;
    expect(data.imported.added).toBe(1);
    expect(data.groups).toEqual([
      { variant: null, earlier: null, namespace: after, comments: 0, threads: 0 },
      { variant: null, earlier: 1, namespace: before, comments: 2, threads: 2 },
    ]);
    const markdown = read(dir, 'REVIEW.md');
    expect(markdown).toContain(
      '## Base, earlier version (before change 1, history/0001.json): Quick Product Analytics'
    );
    expect(markdown).toContain('Second note');
    const json = JSON.parse(read(dir, 'REVIEW.json'));
    expect(json.files[1]).toMatchObject({ variant: null, earlier: 1 });
    expect(json.files[1].file.comments).toHaveLength(2);
  });

  it('keeps the comments store readable when undo removes the namespace history entry', async () => {
    await useFixturePlayer();
    const { dir, base: before } = await explore();
    const patch = join(ws.root, 'tmp', 'rename-for-undo.json');
    mkdirSync(join(ws.root, 'tmp'), { recursive: true });
    writeFileSync(patch, JSON.stringify([{ op: 'replace', path: '/name', value: 'After Undo' }]));
    const iterated = await run('iterate', 'idea', '--patch', patch);
    expect(iterated.code, iterated.stderr || iterated.stdout).toBe(0);
    const after = (await blueprintIdentity(parseBlueprint(JSON.parse(read(dir, 'blueprint.json')))))
      .namespace;
    await createFileCommentsStore(join(ws.root, dir), [before, after]).put(comment(after));

    const undone = await run('undo', 'idea');
    expect(undone.code, undone.stderr || undone.stdout).toBe(0);
    const reopened = createFileCommentsStore(join(ws.root, dir), [before]);
    expect(await reopened.list(before)).toEqual([]);
    await reopened.put(comment(before));
    expect(await createFileCommentsStore(join(ws.root, dir), [before]).list(before)).toHaveLength(
      1
    );
  });

  it('rejects an import that would push the persistent store over 2,000 comments', async () => {
    await useFixturePlayer();
    const { dir, base } = await explore();
    const many = Array.from({ length: 2_001 }, (_, index) =>
      comment(base, {
        id: `comment-${String(index + 1).padStart(5, '0')}`,
        threadId: `comment-${String(index + 1).padStart(5, '0')}`,
      })
    );
    const source = exportFile('too-many.json', base, many);
    const result = await run('feedback', 'idea', '--import', source);
    expect(result.code).toBe(4);
    expect(result.json<{ error: { message: string } }>().error.message).toContain(
      '2,000-comment limit'
    );
    expect(existsSync(join(ws.root, dir, 'review', 'comments.json'))).toBe(false);
  });
});

describe('comments on a served exploration, in Chromium', async () => {
  const probe = await launchChromium();
  if (probe.ok) await probe.browser.close();
  else console.warn(`quick-feedback: ${probe.reason} (${probe.detail}); browser check skipped`);

  it.skipIf(!probe.ok)(
    'posts a comment through the review UI to quick serve, then reports it',
    async () => {
      // The real player build that @protoyard/cli depends on.
      const { dir } = await explore();
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      restore.push(
        setQuickServeOpener(() => {}),
        setQuickServeStop(async (stop) => {
          await released;
          await stop();
        })
      );
      const port = await findFreePort(46_100 + Math.floor(Math.random() * 800));
      const serving = run('serve', 'idea', '--port', String(port), '--strict-port');
      const origin = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i += 1) {
        if (
          await fetch(`${origin}/idea/`).then(
            (r) => r.ok,
            () => false
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const launched = await launchChromium();
      if (!launched.ok) throw new Error(launched.detail);
      const browser = launched.browser;
      try {
        const page = await (await browser.newContext()).newPage();
        const body = 'Signups by channel should be the first chart.';
        page.on('dialog', (dialog) => {
          if (dialog.type() !== 'prompt') return void dialog.dismiss();
          if (dialog.message().startsWith('Name shown')) return void dialog.accept('Riley');
          return void dialog.accept(body);
        });
        // The served launcher sends the player to the comments API on this origin.
        await page.goto(`${origin}/idea/`);
        await page.waitForFunction(
          () => document.documentElement.dataset.pyReady === 'true',
          null,
          {
            timeout: 60_000,
          }
        );
        const launcher = page.getByRole('button', { name: /^Review: \d+ comment threads?/ });
        await launcher.click();
        await page
          .getByRole('navigation', { name: 'Prototype review toolbar' })
          .getByRole('button', { name: 'Comment', exact: true })
          .click();
        await page.locator('[data-py-review-capture]').waitFor();
        const heading = page.locator('h1').first();
        const box = await heading.boundingBox();
        if (!box) throw new Error('the heading is visible');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

        const store = join(ws.root, dir, 'review/comments.json');
        await expect
          .poll(() => (existsSync(store) ? readFileSync(store, 'utf8') : ''), { timeout: 15_000 })
          .toContain(body);
      } finally {
        await browser.close();
        release();
        const served = await serving;
        expect(served.code, served.stderr || served.stdout).toBe(0);
      }

      const feedback = await run('feedback', 'idea');
      expect(feedback.code, feedback.stderr || feedback.stdout).toBe(0);
      expect(read(dir, 'REVIEW.md')).toContain('> Signups by channel should be the first chart\\.');
    },
    120_000
  );
});
