// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { setQuickServeOpener, setQuickServeStop } from '../src/commands/quick/serve.ts';
import { findFreePort } from '../src/lib/ports.ts';
import { QUICK_EVENTS_PATH, QUICK_SERVE_INFO_PATH } from '../src/lib/quick/events.ts';
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

let ws: TempWorkspace;
const restore: (() => void)[] = [];

afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws?.cleanup();
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
});
