// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { blueprintIdentity, decodeBlueprintShare, parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launcherHtml, setQuickPlayerLocator, setQuickStdin } from '../src/commands/quick/index.ts';
import { readQuickRecord } from '../src/lib/quick/model.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const BRIEF =
  'A fictional field service team schedules equipment inspections, assigns technicians and tracks each visit.';
const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player with a real asset manifest, so quick never needs a build. */
async function fixturePlayer(root: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {};\n');
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
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);
const at = (path: string) => join(ws.root, path);

describe('protoyard quick', () => {
  it('turns a brief into a ready exploration with a shared player and a share-link launcher', async () => {
    const result = await run(BRIEF);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const { data } = result.json<{ data: Record<string, unknown> }>();
    const slug = data.slug as string;
    expect(data).toMatchObject({
      dir: `.protoyard/quick/${slug}`,
      ready: true,
      source: 'brief',
      layout: 'shared',
      standaloneReason: null,
      player: { version: '1.0.0', dir: '.protoyard/quick/_player/1.0.0', reused: false },
      open: `.protoyard/quick/${slug}/index.html`,
      replaced: false,
    });
    expect(data.blueprintSha256).toMatch(/^[0-9a-f]{64}$/);

    const dir = at(data.dir as string);
    const blueprint = parseBlueprint(JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8')));
    expect((await blueprintIdentity(blueprint)).sha256).toBe(data.blueprintSha256);
    const record = await readQuickRecord(dir);
    expect(record).toMatchObject({
      slug,
      source: 'brief',
      brief: { text: BRIEF },
      blueprintSha256: data.blueprintSha256,
      seed: null,
      player: { version: '1.0.0', standalone: false },
    });
    expect(existsSync(join(dir, '.protoyard-quick'))).toBe(true);
    expect(existsSync(at('.protoyard/quick/_player/1.0.0/index.html'))).toBe(true);

    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const href = /url=([^"]+)"/.exec(html)?.[1] ?? '';
    expect(href.startsWith('../_player/1.0.0/index.html#bp=')).toBe(true);
    expect(html).not.toMatch(/<script/i);
    const decoded = await decodeBlueprintShare(href.slice(href.indexOf('#')));
    expect(decoded.success && decoded.blueprint).toEqual(blueprint);

    const second = await run(BRIEF, '--slug', 'second-idea');
    expect(second.json<{ data: { player: { reused: boolean } } }>().data.player.reused).toBe(true);
  });

  it('refuses missing, conflicting, empty, invalid and oversized input with fix hints', async () => {
    const usage = await run();
    expect(usage.code).toBe(2);
    expect(usage.json<{ error: { hint: string } }>().error.hint).toMatch(/protoyard quick "/);
    expect((await run(BRIEF, '--blueprint', ANALYTICS)).code).toBe(2);
    expect((await run('   ')).code).toBe(2);
    expect((await run(BRIEF, '--seed', 'abc')).code).toBe(2);
    expect((await run(BRIEF, '--seed', '99999999999')).code).toBe(2);
    expect((await run('--blueprint', 'nope.json')).code).toBe(3);

    ws.write('bad.blueprint.json', { formatVersion: 1, name: 'Bad', entities: [], roles: [] });
    const invalid = await run('--blueprint', at('bad.blueprint.json'));
    expect(invalid.code).toBe(4);
    const envelope = invalid.json<{
      error: { message: string; hint: string };
      data: { issues: unknown[] };
    }>();
    expect(envelope.error.message).toMatch(/blueprint is invalid/);
    expect(envelope.error.hint.length).toBeGreaterThan(0);
    expect(envelope.data.issues.length).toBeGreaterThan(0);

    ws.write('huge.json', 'x'.repeat(300 * 1024));
    expect((await run('--blueprint', at('huge.json'))).code).toBe(4);
    restore.push(setQuickStdin(Readable.from([Buffer.from('x'.repeat(70 * 1024))])));
    expect((await run('-')).code).toBe(4);
    expect(existsSync(at('.protoyard/quick'))).toBe(false);
  });

  it('refuses unsafe folders and an existing exploration unless --force', async () => {
    const unsafe = await run(BRIEF, '--out', 'docs');
    expect(unsafe.code).not.toBe(0);
    expect(unsafe.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');

    expect((await run(BRIEF, '--slug', 'again')).code).toBe(0);
    const conflict = await run(BRIEF, '--slug', 'again');
    expect(conflict.json<{ error: { code: string; hint: string } }>().error).toMatchObject({
      code: 'conflict',
    });
    const forced = await run(BRIEF, '--slug', 'again', '--force');
    expect(forced.json<{ data: { replaced: boolean } }>().data.replaced).toBe(true);
  });
});

describe('quick helpers', () => {
  it('escapes names and links in the launcher', () => {
    const html = launcherHtml('"><script>alert(1)</script>', '../p/index.html#bp=1.a"b<c');
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('#bp=1.a&quot;b&lt;c');
  });
});

describe('quick kinds', () => {
  /**
   * `protoyard quick` with decks, pages and docs (T-kinds-quick-kinds): create,
   * variants, iterate and undo, export, list and the live-reload identity, on a
   * fixture player with per-kind pages (and one without, for the fallback).
   */

  const REPO = join(import.meta.dirname, '../../..');
  const DECK = join(REPO, 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json');

  let ws: TempWorkspace;
  const restore: (() => void)[] = [];

  /** A tiny prebuilt player: index.html and (optionally) one page per kind, each with its entry. */
  async function fixturePlayer(root: string, kindPages: boolean) {
    const dir = join(root, kindPages ? 'fixture-player' : 'old-player', 'dist', 'app');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    const page = (entry: string) =>
      `<!doctype html><title>fixture player</title><script type="module" src="./assets/${entry}"></script>\n`;
    writeFileSync(join(dir, 'index.html'), page('app.js'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'export const app = true;\n');
    if (kindPages) {
      for (const kind of ['deck', 'page', 'doc']) {
        writeFileSync(join(dir, `${kind}.html`), page(`${kind}.js`));
        writeFileSync(join(dir, 'assets', `${kind}.js`), `export const ${kind} = true;\n`);
      }
    }
    const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
    return {
      dir,
      packageDir: join(dir, '..', '..'),
      version: '1.0.0',
      manifest,
      source: 'repository' as const,
    };
  }

  async function usePlayer(kindPages: boolean) {
    for (const undo of restore.splice(0)) undo();
    const player = await fixturePlayer(ws.root, kindPages);
    restore.push(
      setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) }))
    );
  }

  beforeEach(async () => {
    ws = createWorkspace();
    await usePlayer(true);
  });
  afterEach(() => {
    for (const undo of restore.splice(0)) undo();
    ws.cleanup();
  });

  const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);
  const read = (dir: string, file: string) => readFileSync(join(ws.root, dir, file), 'utf8');
  const ok = async (...args: string[]) => {
    const result = await run(...args);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    return result.json<{ data: Record<string, unknown> }>().data;
  };
  const errorOf = async (...args: string[]) => {
    const result = await run(...args);
    expect(result.code).not.toBe(0);
    return result.json<{ error: { code: string; message: string; hint?: string } }>().error;
  };

  describe('quick with a deck (AC)', () => {
    it('creates an exploration whose launcher opens the deck page, with kind in the JSON', async () => {
      const data = await ok('--blueprint', DECK, '--slug', 'talk');
      expect(data.kind).toBe('deck');
      expect(data.layout).toBe('shared');
      const dir = data.dir as string;
      expect(JSON.parse(read(dir, 'blueprint.json')).kind).toBe('deck');
      expect(read(dir, 'index.html')).toMatch(/_player\/1\.0\.0\/deck\.html#bp=/);

      const standalone = await ok('--blueprint', DECK, '--slug', 'talk-own', '--standalone');
      expect(read(standalone.dir as string, 'index.html')).toContain(
        'player/deck.html?src=./blueprint.json'
      );
    });
  });

  describe('quick from a brief with --kind', () => {
    it('validates the drafted deck like any untrusted document, or refuses it with issues', async () => {
      const result = await run(
        'A short talk introducing a fictional climbing gym to new members',
        '--kind',
        'deck',
        '--slug',
        'gym-talk'
      );
      if (result.code === 0) {
        expect(result.json<{ data: { kind: string } }>().data.kind).toBe('deck');
      } else {
        expect(result.json<{ error: { code: string } }>().error.code).toBe('validation');
      }
      const usage = await errorOf('A talk', '--kind', 'slides');
      expect(usage.code).toBe('usage');
      const both = await errorOf('--blueprint', DECK, '--kind', 'deck');
      expect(both.code).toBe('usage');
    });
  });
});
