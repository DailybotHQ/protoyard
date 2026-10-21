// @vitest-environment node
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import {
  QUICK_SERVE_DEFAULT_PORT,
  resolveQuickServeTarget,
  setQuickServeOpener,
  setQuickServeStop,
} from '../src/commands/quick/serve.ts';
import { findFreePort } from '../src/lib/ports.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];
let opened: string[] = [];

/** A tiny prebuilt player with a real asset manifest, so quick never needs a build. */
async function fixturePlayer(root: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  return {
    dir,
    packageDir: join(root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
}

/** A stop signal the test fires, instead of Ctrl+C. */
function manualStop() {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  restore.push(
    setQuickServeStop(async (stop) => {
      await released;
      await stop();
    })
  );
  return () => release();
}

beforeEach(async () => {
  ws = createWorkspace();
  const player = await fixturePlayer(ws.root);
  opened = [];
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
    setQuickServeOpener((url) => opened.push(url)),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function create(...extra: string[]) {
  const result = await run('--blueprint', ANALYTICS, ...extra);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return result.json<{ data: { slug: string; dir: string } }>().data;
}

/** Starts `quick serve` on a free port, returns its envelope once stopped plus a fetcher. */
async function serve(target: string, ...extra: string[]) {
  const port = await findFreePort(43_800 + Math.floor(Math.random() * 1_000));
  const stop = manualStop();
  const pending = run('serve', target, '--port', String(port), '--strict-port', ...extra);
  const base = `http://127.0.0.1:${port}`;
  // The envelope prints before keepAlive; wait until the server answers.
  for (let i = 0; i < 100; i += 1) {
    const ok = await fetch(`${base}/`).then(
      () => true,
      () => false
    );
    if (ok) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    base,
    fetchText: async (path: string) => {
      const response = await fetch(`${base}${path}`);
      return { status: response.status, text: await response.text() };
    },
    finish: async () => {
      stop();
      const result = await pending;
      return result;
    },
  };
}

describe('protoyard quick serve', () => {
  it('serves a shared-player exploration from the quick zone and reports the launcher URL', async () => {
    const { slug } = await create();
    const server = await serve(slug);
    const launcher = await server.fetchText(`/${slug}/`);
    expect(launcher.status).toBe(200);
    expect(launcher.text).toContain('http-equiv="refresh"');
    const href = /url=([^"]+)"/.exec(launcher.text)?.[1] ?? '';
    expect(href).toMatch(/^\.\.\/_player\/1\.0\.0\/index\.html#bp=1\./);
    // The relative link resolves on the same server.
    const player = await server.fetchText(`/${slug}/${href.split('#')[0]}`);
    expect(player.status).toBe(200);
    expect(player.text).toContain('fixture player');
    // Not a single-page app: unknown paths are 404s, not the launcher.
    expect((await server.fetchText(`/${slug}/missing.json`)).status).toBe(404);

    const result = await server.finish();
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const { data } = result.json<{ data: Record<string, unknown> }>();
    expect(data).toMatchObject({
      slug,
      url: `${server.base}/${slug}/`,
      layout: 'shared',
      playerVersion: '1.0.0',
      root: '.protoyard/quick',
      opened: false,
    });
    expect(opened).toEqual([]);
  });

  it('limits a shared server to its exploration and matching player, and persists same-origin review comments', async () => {
    const { slug, dir } = await create('--slug', 'primary-board');
    await create('--slug', 'second-board');
    const server = await serve(slug);
    const blueprint = parseBlueprint(
      JSON.parse(readFileSync(join(ws.root, dir, 'blueprint.json'), 'utf8')) as unknown
    );
    const reviewSlug = (await blueprintIdentity(blueprint)).namespace;

    expect((await server.fetchText('/')).status).toBe(404);
    expect((await server.fetchText(`/${slug}`)).status).toBe(404);
    expect((await server.fetchText('/second-board/quick.json')).status).toBe(404);
    expect((await server.fetchText('/_player/2.0.0/index.html')).status).toBe(404);
    expect((await server.fetchText(`/${slug}/quick.json`)).status).toBe(200);
    const hostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        `${server.base}/${slug}/`,
        { headers: { host: 'attacker.example' } },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode ?? 0));
        }
      );
      request.on('error', reject);
      request.end();
    });
    expect(hostStatus).toBe(421);

    const input = {
      formatVersion: 1,
      id: 'comment-00001',
      threadId: 'comment-00001',
      slug: reviewSlug,
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
    };
    const saved = await fetch(`${server.base}/api/comments/${reviewSlug}/comment-00001`, {
      method: 'PUT',
      headers: {
        origin: server.base,
        'content-type': 'application/json',
        'x-review-client-id': 'client-reviewer-1',
      },
      body: JSON.stringify(input),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).comment).toMatchObject({ id: input.id, slug: reviewSlug });

    expect((await server.fetchText(`/api/comments/${slug}`)).status).toBe(404);
    const forbidden = await fetch(`${server.base}/api/comments/${reviewSlug}/comment-00002`, {
      method: 'PUT',
      headers: {
        origin: 'http://attacker.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...input, id: 'comment-00002', threadId: 'comment-00002' }),
    });
    expect(forbidden.status).toBe(403);

    const oversized = await fetch(`${server.base}/api/comments/${reviewSlug}/comment-00003`, {
      method: 'PUT',
      headers: {
        origin: server.base,
        'content-type': 'application/json',
        'x-review-client-id': 'client-reviewer-1',
      },
      body: JSON.stringify({
        ...input,
        id: 'comment-00003',
        threadId: 'comment-00003',
        body: 'x'.repeat(17_000),
      }),
    });
    expect(oversized.status).toBe(413);

    const folder = join(ws.root, '.protoyard', 'quick', slug);
    const persisted = JSON.parse(readFileSync(join(folder, 'review', 'comments.json'), 'utf8'));
    expect(persisted.comments).toHaveLength(1);
    expect(persisted.comments[0]).toMatchObject({ id: input.id, slug: reviewSlug });
    expect((await server.finish()).code).toBe(0);
  });

  it('serves a standalone exploration from its own folder, by path, and opens the browser', async () => {
    const { slug, dir } = await create('--standalone', '--slug', 'solo-board');
    expect(slug).toBe('solo-board');
    const server = await serve(join(ws.root, dir), '--open');
    const launcher = await server.fetchText('/');
    expect(launcher.text).toMatch(/url=player\/index\.html\?src=\.\/blueprint\.json/);
    expect((await server.fetchText('/player/blueprint.json')).status).toBe(200);
    // The rest of the quick zone is not reachable from a standalone root.
    expect((await server.fetchText('/_player/1.0.0/index.html')).status).toBe(404);
    const result = await server.finish();
    const { data } = result.json<{ data: Record<string, unknown> }>();
    expect(data).toMatchObject({ layout: 'standalone', url: `${server.base}/`, opened: true });
    expect(opened).toEqual([`${server.base}/`]);
  });

  it('falls back to the next free port unless --strict-port', async () => {
    const busy = await findFreePort(44_900 + Math.floor(Math.random() * 500));
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(busy, '127.0.0.1', resolve));
    try {
      const { slug } = await create();
      const stop = manualStop();
      const pending = run('serve', slug, '--port', String(busy));
      // Let it bind, then stop.
      await new Promise((resolve) => setTimeout(resolve, 300));
      stop();
      const result = await pending;
      expect(result.code, result.stderr || result.stdout).toBe(0);
      const port = result.json<{ data: { port: number } }>().data.port;
      expect(port).toBeGreaterThan(busy);

      const strict = await run('serve', slug, '--port', String(busy), '--strict-port');
      expect(strict.code).not.toBe(0);
      expect(strict.json<{ error: { code: string; hint?: string } }>().error.code).toBe('conflict');
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('serves only folders `protoyard quick` wrote', async () => {
    const { slug, dir } = await create();
    const notAnExploration = join(ws.root, 'docs-site');
    mkdirSync(notAnExploration, { recursive: true });
    writeFileSync(join(notAnExploration, 'index.html'), '<p>hello</p>');
    const plain = await run('serve', notAnExploration);
    expect(plain.code).not.toBe(0);
    expect(plain.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');

    const link = join(ws.root, 'linked-exploration');
    symlinkSync(join(ws.root, dir), link, 'dir');
    const linked = await run('serve', link);
    expect(linked.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');

    const missing = await run('serve', 'no-such-idea');
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('not_found');

    // A shared exploration whose player was removed explains how to recover.
    rmSync(join(ws.root, '.protoyard/quick/_player'), { recursive: true, force: true });
    const orphan = await run('serve', slug);
    const error = orphan.json<{ error: { code: string; hint?: string } }>().error;
    expect(error.code).toBe('not_found');
    expect(error.hint).toMatch(/--standalone/);
  });

  it('resolves a slug to the zone folder and keeps the default port', async () => {
    const { slug } = await create();
    const target = await resolveQuickServeTarget({
      workspaceRoot: ws.root,
      cwd: ws.root,
      target: slug,
    });
    expect(target).toMatchObject({ slug, layout: 'shared', path: `/${slug}/` });
    expect(target.root.endsWith(join('.protoyard', 'quick'))).toBe(true);
    expect(QUICK_SERVE_DEFAULT_PORT).toBe(4180);
    const bad = await run('serve', slug, '--port', '70000');
    expect(bad.json<{ error: { code: string } }>().error.code).toBe('usage');
  });
});
