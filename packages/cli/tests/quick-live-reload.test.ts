// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { setQuickServeOpener, setQuickServeStop } from '../src/commands/quick/serve.ts';
import { findFreePort } from '../src/lib/ports.ts';
import {
  type BlueprintChange,
  QUICK_EVENTS_PATH,
  QUICK_SERVE_INFO_PATH,
  readBlueprintIdentity,
  sseFrame,
  watchBlueprints,
} from '../src/lib/quick/events.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * `quick serve` live reload: a blueprint change becomes ONE debounced
 * server-sent event with the new identity (never content), the comments
 * allowlist follows the change, and only the served exploration is reachable.
 * The browser part drives the real player: it posts a review comment into the
 * exploration's review/comments.json and follows a `quick iterate` in place.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ANALYTICS = join(REPO, 'blueprints/quick/analytics.json');
const analytics = () => JSON.parse(readFileSync(ANALYTICS, 'utf8')) as Record<string, unknown>;

let ws: TempWorkspace;
const restore: (() => void)[] = [];

afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws?.cleanup();
});

/** Writes like `quick iterate` does: a temp file renamed over the target. */
function writeAtomic(path: string, text: string) {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

describe('watchBlueprints', () => {
  beforeEach(() => {
    ws = createWorkspace();
  });

  /** A watcher on a fake fs.watch the test fires by hand. */
  async function fakeWatch(files: { id: string; file: string; path: string }[], debounceMs = 20) {
    const listeners = new Map<string, (name: string | null) => void>();
    const changes: BlueprintChange[] = [];
    const watcher = await watchBlueprints({
      files,
      debounceMs,
      onChange: (change) => changes.push(change),
      watchDir: (dir, listener) => {
        listeners.set(dir, listener);
        return { close: () => listeners.delete(dir) };
      },
    });
    const fire = (dir: string, name: string | null = 'blueprint.json') =>
      listeners.get(dir)?.(name);
    return { watcher, changes, fire, listeners };
  }
  const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

  it('turns a burst of writes into one change with the new identity', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    writeFileSync(file, JSON.stringify(analytics()));
    const before = await readBlueprintIdentity(file);
    const { watcher, changes, fire } = await fakeWatch([
      { id: 'base', file, path: '/idea/blueprint.json' },
    ]);
    expect(watcher.current()).toEqual({ base: before?.sha256 });

    writeAtomic(file, JSON.stringify({ ...analytics(), name: 'Renamed Analytics' }));
    for (let i = 0; i < 5; i += 1) fire(dir);
    await settle();
    const after = await readBlueprintIdentity(file);
    expect(changes).toEqual([
      {
        file: 'base',
        path: '/idea/blueprint.json',
        sha256: after?.sha256,
        previous: before?.sha256,
        namespace: after?.namespace,
      },
    ]);
    expect(watcher.current()).toEqual({ base: after?.sha256 });
    watcher.close();
  });

  it('stays quiet for an identical rewrite, a half-written file and another file', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    const text = JSON.stringify(analytics());
    writeFileSync(file, text);
    const { watcher, changes, fire } = await fakeWatch([
      { id: 'base', file, path: '/idea/blueprint.json' },
    ]);
    writeAtomic(file, `${text}\n`); // Same content, other bytes: same identity.
    fire(dir);
    await settle();
    writeFileSync(file, text.slice(0, 40)); // Mid-write.
    fire(dir);
    await settle();
    fire(dir, 'quick.json');
    await settle();
    expect(changes).toEqual([]);
    watcher.close();
  });

  it('watches each variant by its own id and path', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(join(dir, 'v1'), { recursive: true });
    writeFileSync(join(dir, 'blueprint.json'), JSON.stringify(analytics()));
    writeFileSync(join(dir, 'v1', 'blueprint.json'), JSON.stringify(analytics()));
    const { changes, fire, watcher } = await fakeWatch([
      { id: 'base', file: join(dir, 'blueprint.json'), path: '/idea/blueprint.json' },
      { id: 'v1', file: join(dir, 'v1', 'blueprint.json'), path: '/idea/v1/blueprint.json' },
    ]);
    writeAtomic(join(dir, 'v1', 'blueprint.json'), JSON.stringify({ ...analytics(), name: 'V1' }));
    fire(join(dir, 'v1'));
    await settle();
    expect(changes.map((change) => [change.file, change.path])).toEqual([
      ['v1', '/idea/v1/blueprint.json'],
    ]);
    watcher.close();
  });

  it('sees an atomic write through the real fs.watch', async () => {
    const dir = join(ws.root, 'idea');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'blueprint.json');
    writeFileSync(file, JSON.stringify(analytics()));
    const changes: BlueprintChange[] = [];
    const watcher = await watchBlueprints({
      files: [{ id: 'base', file, path: '/idea/blueprint.json' }],
      onChange: (change) => changes.push(change),
    });
    writeAtomic(file, JSON.stringify({ ...analytics(), name: 'Watched for real' }));
    for (let i = 0; i < 60 && changes.length === 0; i += 1) await settle(50);
    watcher.close();
    expect(changes).toHaveLength(1);
  });

  it('frames one JSON line per event', () => {
    expect(sseFrame('blueprint', { sha256: 'a' })).toBe(
      'event: blueprint\ndata: {"sha256":"a"}\n\n'
    );
  });
});

/** A tiny prebuilt player, so `quick` never needs a build. */
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

type Player = Awaited<ReturnType<typeof fixturePlayer>>;

async function useWorkspace(player?: (root: string) => Promise<Player> | Player) {
  ws = createWorkspace();
  const located = await (player ?? fixturePlayer)(ws.root);
  restore.push(
    setQuickPlayerLocator(() => ({ ...located, manifest: readPlayerAssetsManifest(located.dir) })),
    setQuickServeOpener(() => undefined)
  );
}

const quick = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function create(slug: string, blueprint = ANALYTICS) {
  const result = await quick('--blueprint', blueprint, '--slug', slug);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return result.json<{ data: { slug: string; dir: string; blueprintSha256: string } }>().data;
}

/** `quick serve` on a free loopback port until `finish()`. */
async function serve(target: string) {
  const port = await findFreePort(48_300 + Math.floor(Math.random() * 600));
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
  const pending = quick('serve', target, '--port', String(port), '--strict-port');
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    if (
      await fetch(`${base}/`).then(
        () => true,
        () => false
      )
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {
    base,
    port,
    finish: async () => {
      release();
      return pending;
    },
  };
}

/** Opens the event stream and collects parsed frames. */
function subscribe(base: string, headers: Record<string, string> = {}) {
  const frames: { event: string; data: Record<string, unknown> }[] = [];
  let response: IncomingMessage | undefined;
  const opened = new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpRequest(`${base}${QUICK_EVENTS_PATH}`, { headers }, (res) => {
      response = res;
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let end = buffer.indexOf('\n\n');
        while (end !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event && data) frames.push({ event, data: JSON.parse(data) });
          end = buffer.indexOf('\n\n');
        }
      });
      resolve(res);
    });
    request.on('error', reject);
    request.end();
  });
  return {
    frames,
    opened,
    close: () => response?.destroy(),
    waitFor: async (event: string, count = 1) => {
      for (let i = 0; i < 100; i += 1) {
        if (frames.filter((frame) => frame.event === event).length >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`no ${event} event`);
    },
  };
}

describe('quick serve live reload', () => {
  it('describes itself, streams one hash-only event per iterate, and refuses cross-origin', async () => {
    await useWorkspace();
    const { slug, dir, blueprintSha256 } = await create('live-idea');
    const server = await serve(slug);

    const info = await fetch(`${server.base}${QUICK_SERVE_INFO_PATH}`);
    expect(info.status).toBe(200);
    expect(await info.json()).toEqual({
      protocol: 1,
      events: QUICK_EVENTS_PATH,
      comments: '/api/comments',
    });
    const crossOrigin = await fetch(`${server.base}${QUICK_SERVE_INFO_PATH}`, {
      headers: { Origin: 'http://elsewhere.example' },
    });
    expect(crossOrigin.status).toBe(403);
    expect((await fetch(`${server.base}/__protoyard/other`)).status).toBe(404);

    const stream = subscribe(server.base);
    const response = await stream.opened;
    expect(response.headers['content-type']).toContain('text/event-stream');
    await stream.waitFor('hello');
    expect(stream.frames[0]?.data).toEqual({ protocol: 1, blueprints: { base: blueprintSha256 } });

    const patch = join(ws.root, 'tmp', 'rename.json');
    mkdirSync(join(ws.root, 'tmp'), { recursive: true });
    writeFileSync(patch, JSON.stringify([{ op: 'replace', path: '/name', value: 'Live Metrics' }]));
    const iterated = await quick('iterate', slug, '--patch', patch);
    expect(iterated.code, iterated.stderr || iterated.stdout).toBe(0);
    await stream.waitFor('blueprint');
    // The write settles into exactly one event.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const events = stream.frames.filter((frame) => frame.event === 'blueprint');
    const record = JSON.parse(readFileSync(join(ws.root, dir, 'quick.json'), 'utf8')) as {
      blueprintSha256: string;
    };
    expect(events).toEqual([
      {
        event: 'blueprint',
        data: {
          file: 'base',
          path: `/${slug}/blueprint.json`,
          sha256: record.blueprintSha256,
          previous: blueprintSha256,
        },
      },
    ]);
    // A hash and a path, never the blueprint.
    expect(JSON.stringify(events)).not.toContain('Live Metrics');
    // The player can read the changed file from the path it was given.
    const changed = await fetch(`${server.base}/${slug}/blueprint.json`);
    expect(((await changed.json()) as { name: string }).name).toBe('Live Metrics');

    stream.close();
    expect((await server.finish()).code).toBe(0);
  }, 60_000);

  it('accepts comments under the changed blueprint’s namespace and the ones before it', async () => {
    await useWorkspace();
    const { slug } = await create('comment-idea');
    const before = await readBlueprintIdentity(
      join(ws.root, '.protoyard/quick', slug, 'blueprint.json')
    );
    const patch = join(ws.root, 'tmp', 'rename.json');
    mkdirSync(join(ws.root, 'tmp'), { recursive: true });
    writeFileSync(patch, JSON.stringify([{ op: 'replace', path: '/name', value: 'Before Serve' }]));
    expect((await quick('iterate', slug, '--patch', patch)).code).toBe(0);

    // Started after an iterate: the history's namespace still takes comments.
    const server = await serve(slug);
    expect((await fetch(`${server.base}/api/comments/${before?.namespace}`)).status).toBe(200);
    const stream = subscribe(server.base);
    await stream.waitFor('hello');
    writeFileSync(patch, JSON.stringify([{ op: 'replace', path: '/name', value: 'While Served' }]));
    expect((await quick('iterate', slug, '--patch', patch)).code).toBe(0);
    await stream.waitFor('blueprint');
    const after = await readBlueprintIdentity(
      join(ws.root, '.protoyard/quick', slug, 'blueprint.json')
    );
    expect((await fetch(`${server.base}/api/comments/${after?.namespace}`)).status).toBe(200);
    expect((await fetch(`${server.base}/api/comments/bp-notanexplorationatall0`)).status).toBe(404);
    stream.close();
    await server.finish();
  }, 60_000);

  it('serves only its own exploration and player: another exploration is a 404', async () => {
    await useWorkspace();
    const { slug } = await create('first-idea');
    const other = await create('second-idea');
    const server = await serve(slug);
    expect((await fetch(`${server.base}/${slug}/quick.json`)).status).toBe(200);
    for (const path of [
      `/${other.slug}/quick.json`,
      `/${other.slug}/blueprint.json`,
      `/${other.slug}/`,
      '/',
      '/_player/9.9.9/index.html',
    ]) {
      expect((await fetch(`${server.base}${path}`)).status, path).toBe(404);
    }
    await server.finish();
  }, 60_000);
});

describe('the real player under quick serve', () => {
  const playerDir = join(REPO, 'packages/player/dist/app');
  const ensureBuild = () => {
    if (existsSync(join(playerDir, 'index.html'))) return;
    const built = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    if (built.status !== 0) throw new Error(`player build failed:\n${built.stderr}${built.stdout}`);
  };

  it('posts a review comment into review/comments.json and follows an iterate in place', async () => {
    ensureBuild();
    let chromium: typeof import('@playwright/test').chromium;
    try {
      ({ chromium } = await import('@playwright/test'));
    } catch (error) {
      console.warn(
        `quick-live-reload: Playwright unavailable (${String(error)}); browser check skipped`
      );
      return;
    }
    await useWorkspace(async () => ({
      dir: playerDir,
      packageDir: join(REPO, 'packages/player'),
      version: JSON.parse(readFileSync(join(REPO, 'packages/player/package.json'), 'utf8')).version,
      manifest: readPlayerAssetsManifest(playerDir),
      source: 'repository' as const,
    }));
    const { slug, dir } = await create('browser-idea');
    const server = await serve(slug);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      try {
        browser = await chromium.launch();
      } catch (error) {
        console.warn(
          `quick-live-reload: Chromium unavailable (${String(error).split('\n')[0]}); browser check skipped`
        );
        return;
      }
      const page = await browser.newPage();
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(error.message));
      // Answer the review prompts: the reviewer's name, then the comment body.
      page.on('dialog', (dialog) => {
        if (dialog.type() !== 'prompt') return void dialog.dismiss();
        return void dialog.accept(
          dialog.message().startsWith('Name shown')
            ? 'Juniper Example'
            : 'Live comment from the test'
        );
      });
      await page.goto(`${server.base}/${slug}/`);
      await page.waitForSelector('html[data-protoyard-ready="1"]', {
        state: 'attached',
        timeout: 60_000,
      });
      await page.evaluate(() => {
        (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
      });

      // Review comments: the toolbar is there, and a pin lands in the exploration's store.
      const launcher = page.getByRole('button', { name: /^Review: \d+ comment threads?/ });
      await launcher.waitFor({ timeout: 30_000 });
      await launcher.click();
      await page
        .getByRole('navigation', { name: 'Prototype review toolbar' })
        .getByRole('button', { name: 'Comment', exact: true })
        .click();
      const heading = page.getByRole('heading', { level: 1 }).first();
      const box = await heading.boundingBox();
      if (!box) throw new Error('the page heading is visible');
      await page.mouse.click(box.x + box.width / 3, box.y + box.height / 2);
      const store = join(ws.root, dir, 'review', 'comments.json');
      for (let i = 0; i < 100 && !existsSync(store); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const saved = JSON.parse(readFileSync(store, 'utf8')) as {
        comments: { body: string; slug: string }[];
      };
      expect(saved.comments.map((comment) => comment.body)).toContain('Live comment from the test');

      // Live reload: a safe iterate re-derives in place, in the same document.
      expect(await page.evaluate(() => document.body.innerText.includes('Reloaded Metrics'))).toBe(
        false
      );
      const patch = join(ws.root, 'tmp', 'rename.json');
      mkdirSync(join(ws.root, 'tmp'), { recursive: true });
      writeFileSync(
        patch,
        JSON.stringify([{ op: 'replace', path: '/name', value: 'Reloaded Metrics' }])
      );
      expect((await quick('iterate', slug, '--patch', patch)).code).toBe(0);
      await page.waitForFunction(
        () => document.body.innerText.includes('Reloaded Metrics'),
        undefined,
        {
          timeout: 30_000,
        }
      );
      expect(
        await page.evaluate(
          () => (window as unknown as { __sameDocument?: boolean }).__sameDocument
        )
      ).toBe(true);
      expect(problems).toEqual([]);
    } finally {
      await browser?.close();
      await server.finish();
    }
  }, 300_000);
});
