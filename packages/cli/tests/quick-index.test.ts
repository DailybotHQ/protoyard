// @vitest-environment node
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { setQuickServeOpener, setQuickServeStop } from '../src/commands/quick/serve.ts';
import { QUICK_INDEX_CSP, renderQuickIndex } from '../src/lib/quick/index-html.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');
const TEAM_CHAT = join(import.meta.dirname, '../../../blueprints/quick/team-chat.json');

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

beforeEach(async () => {
  ws = createWorkspace();
  const player = await fixturePlayer(ws.root);
  opened = [];
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
    setQuickServeOpener((url) => opened.push(url)),
    // `quick open` serves until stopped; stop right away so the command returns.
    setQuickServeStop(async (stop) => stop()),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function explore(...args: string[]) {
  const result = await run(...args);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return result.json<{ data: { slug: string; dir: string } }>().data;
}

const ZONE = '.protoyard/quick';

interface ListData {
  root: string;
  explorations: {
    slug: string;
    folder: string;
    name: string | null;
    dir: string;
    open: string;
    variants: { id: string; label: string; open: string }[];
    compare: string | null;
    review: string | null;
    promotedTo: unknown;
  }[];
  skipped: { folder: string; reason: string }[];
}

const editJson = (path: string, edit: (value: Record<string, unknown>) => void) => {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  edit(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

describe('protoyard quick list', () => {
  it('lists marked explorations only, newest first, with variants, compare and REVIEW.md', async () => {
    const board = await explore(
      '--blueprint',
      ANALYTICS,
      '--slug',
      'board-idea',
      '--variants',
      '2'
    );
    const chat = await explore('--blueprint', TEAM_CHAT, '--slug', 'chat-idea');
    // Make the order deterministic: the chat exploration is older.
    editJson(join(ws.root, chat.dir, 'quick.json'), (record) => {
      record.updatedAt = '2026-01-01T00:00:00.000Z';
    });
    writeFileSync(join(ws.root, board.dir, 'REVIEW.md'), '# Review\n');

    // Noise the scan must ignore or report: an unmarked folder, a symlinked
    // exploration, a stray file, and a marked folder with a broken quick.json.
    mkdirSync(join(ws.root, ZONE, 'not-mine'), { recursive: true });
    writeFileSync(join(ws.root, ZONE, 'not-mine', 'quick.json'), '{}');
    symlinkSync(join(ws.root, board.dir), join(ws.root, ZONE, 'linked-idea'), 'dir');
    writeFileSync(join(ws.root, ZONE, 'notes.txt'), 'hello');
    mkdirSync(join(ws.root, ZONE, 'broken-idea'), { recursive: true });
    writeFileSync(join(ws.root, ZONE, 'broken-idea', '.protoyard-quick'), '');
    writeFileSync(join(ws.root, ZONE, 'broken-idea', 'quick.json'), '{"format":"nope"}');

    const result = await run('list');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: ListData }>().data;
    expect(data.root).toBe(ZONE);
    expect(data.explorations.map((entry) => entry.slug)).toEqual(['board-idea', 'chat-idea']);
    const [first, second] = data.explorations;
    expect(first).toMatchObject({
      folder: 'board-idea',
      dir: `${ZONE}/board-idea`,
      open: `${ZONE}/board-idea/index.html`,
      compare: `${ZONE}/board-idea/compare.html`,
      review: `${ZONE}/board-idea/REVIEW.md`,
      promotedTo: null,
    });
    expect(first?.name).toEqual(expect.any(String));
    expect(first?.variants.map((variant) => [variant.id, variant.open])).toEqual([
      ['v1', `${ZONE}/board-idea/v1/index.html`],
      ['v2', `${ZONE}/board-idea/v2/index.html`],
    ]);
    expect(second).toMatchObject({ variants: [], compare: null, review: null });
    expect(data.skipped).toEqual([{ folder: 'broken-idea', reason: expect.any(String) }]);

    // Explorations never enter the prototype registry.
    const registry = await cli(['--root', ws.root, '--json', 'list']);
    expect(registry.stdout).not.toContain('board-idea');
  }, 60_000);

  it('reports an empty zone when there are no explorations', async () => {
    const result = await run('list');
    expect(result.code).toBe(0);
    expect(result.json<{ data: ListData }>().data).toEqual({
      root: ZONE,
      explorations: [],
      skipped: [],
    });
  });
});

describe('protoyard quick open', () => {
  it('serves and opens a listed exploration by slug, and refuses unknown names', async () => {
    await explore('--blueprint', ANALYTICS, '--slug', 'open-me');
    const result = await run('open', 'open-me', '--port', '45710');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: { url: string; opened: boolean } }>().data;
    expect(data.opened).toBe(true);
    expect(opened).toEqual([data.url]);
    expect(data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/open-me\/$/);

    // An unmarked folder in the zone is not an exploration, even by name.
    mkdirSync(join(ws.root, ZONE, 'plain-folder'), { recursive: true });
    for (const name of ['plain-folder', 'missing-idea']) {
      const missing = await run('open', name);
      const error = missing.json<{ error: { code: string; hint?: string } }>().error;
      expect(error.code).toBe('not_found');
      expect(error.hint).toContain('open-me');
    }
    expect(opened).toHaveLength(1);
  }, 60_000);
});

describe('protoyard quick index', () => {
  it('writes an escaped, script-free index linking each exploration', async () => {
    const board = await explore(
      '--blueprint',
      ANALYTICS,
      '--slug',
      'board-idea',
      '--variants',
      '2'
    );
    // Hostile labels: a blueprint name and a variant label from files on disk.
    editJson(join(ws.root, board.dir, 'blueprint.json'), (blueprint) => {
      blueprint.name = '<script>alert("name")</script>';
    });
    editJson(join(ws.root, board.dir, 'quick.json'), (record) => {
      (record.variants as { label: string }[])[0]!.label = '"><img src=x onerror=alert(1)>';
    });
    writeFileSync(join(ws.root, board.dir, 'REVIEW.md'), '# Review\n');

    const result = await run('index');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(result.json<{ data: { file: string; explorations: number } }>().data).toMatchObject({
      file: `${ZONE}/index.html`,
      explorations: 1,
    });
    const html = readFileSync(join(ws.root, ZONE, 'index.html'), 'utf8');
    // No live tag or attribute: the hostile text survives only as escaped text.
    expect(html).not.toMatch(/<script|<img|javascript:/i);
    expect(html).toContain('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain(`content="${QUICK_INDEX_CSP.replace(/'/g, '&#39;')}"`);
    for (const href of [
      'board-idea/index.html',
      'board-idea/v1/index.html',
      'board-idea/v2/index.html',
      'board-idea/compare.html',
      'board-idea/REVIEW.md',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  }, 60_000);

  it('never links outside the zone and renders an empty state', () => {
    const html = renderQuickIndex([
      {
        slug: 'hostile',
        name: null,
        source: 'brief',
        updatedAt: '2026-10-20T00:00:00.000Z',
        open: 'javascript:alert(1)',
        variants: [
          { label: 'up', href: '../outside.html' },
          { label: 'host', href: '//evil.example/x' },
          { label: 'abs', href: '/etc/passwd' },
        ],
        compare: 'https://evil.example/',
        review: 'hostile/REVIEW.md',
        promotedTo: null,
      },
    ]);
    expect(html.match(/href="/g)).toHaveLength(1);
    expect(html).toContain('href="hostile/REVIEW.md"');
    expect(html).not.toMatch(/javascript:|evil\.example|outside\.html|\/etc\/passwd/);

    expect(renderQuickIndex([])).toContain('No explorations yet');
  });

  it('refuses when there is no quick zone', async () => {
    const result = await run('index');
    expect(result.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });
});
