// @vitest-environment node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../../src/commands/quick/index.ts';
import { readBlueprintIdentity } from '../../src/lib/quick/events.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from '../helpers.ts';

/**
 * `protoyard quick` with decks, pages and docs (T-kinds-quick-kinds): create,
 * variants, iterate and undo, export, list and the live-reload identity, on a
 * fixture player with per-kind pages (and one without, for the fallback).
 */

const REPO = join(import.meta.dirname, '../../../..');
const DECK = join(REPO, 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json');
const PAGE = join(REPO, 'blueprints/pages/tidewater-roasters-landing.json');
const DOC = join(REPO, 'blueprints/docs/northwind-quarterly-report.json');

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
function patchFile(name: string, operations: unknown): string {
  mkdirSync(join(ws.root, 'tmp'), { recursive: true });
  const path = join(ws.root, 'tmp', name);
  writeFileSync(path, JSON.stringify(operations));
  return path;
}
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
    }
  };
  walk(join(ws.root, dir), '');
  return files;
}

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

  it('varies only the deck axes, deterministically, with launchers on the deck page (AC)', async () => {
    const first = await ok('--blueprint', DECK, '--slug', 'talk', '--variants', '3', '--seed', '7');
    const dir = first.dir as string;
    const base = JSON.parse(read(dir, 'blueprint.json'));
    const variants = first.variants as { id: string; label: string }[];
    expect(variants.map((variant) => variant.id)).toEqual(['v1', 'v2', 'v3']);
    const texts = variants.map((variant) => read(dir, `${variant.id}/blueprint.json`));
    for (const [index, text] of texts.entries()) {
      const variant = JSON.parse(text);
      expect(variant.kind).toBe('deck');
      expect(variant.deck.slides).toEqual(base.deck.slides);
      const { style, ...rest } = variant.deck;
      const { style: baseStyle, ...baseRest } = base.deck;
      expect(rest).toEqual(baseRest);
      expect(canonicalJson(style)).not.toBe(canonicalJson(baseStyle));
      for (const key of Object.keys(style)) {
        expect(['theme', 'transition', 'density', 'fontPair']).toContain(key);
      }
      expect({ ...variant, deck: undefined }).toEqual({ ...base, deck: undefined });
      expect(read(dir, `${variants[index]?.id}/index.html`)).toMatch(/deck\.html\?seed=7#bp=/);
    }
    expect(read(dir, 'compare.html')).toContain('v3');

    const again = await ok(
      '--blueprint',
      DECK,
      '--slug',
      'talk',
      '--variants',
      '3',
      '--seed',
      '7',
      '--force'
    );
    expect(
      (again.variants as { id: string }[]).map((variant) =>
        read(dir, `${variant.id}/blueprint.json`)
      )
    ).toEqual(texts);
  });

  it('iterates with a patch, keeps the world, and undoes byte for byte (AC)', async () => {
    const { dir } = (await ok('--blueprint', DECK, '--slug', 'talk')) as { dir: string };
    const before = snapshot(dir);
    const iterated = await ok(
      'iterate',
      'talk',
      '--patch',
      patchFile('fade.json', [
        { op: 'add', path: '/deck/style/transition', value: 'fade' },
        { op: 'replace', path: '/name', value: 'Fade deck' },
      ])
    );
    expect(iterated).toMatchObject({
      kind: 'deck',
      changed: true,
      world: { preserved: true, fromVersion: 1, toVersion: 1, ops: [] },
    });
    const after = JSON.parse(read(dir, 'blueprint.json'));
    expect(after.deck.style.transition).toBe('fade');
    expect(after.history).toBeUndefined();
    expect(read(dir, 'index.html')).toContain('deck.html#bp=');
    expect(read(dir, 'index.html')).toContain('<title>Fade deck</title>');

    // An invalid patch, or one that changes the kind, writes nothing.
    const changed = snapshot(dir);
    for (const ops of [
      [{ op: 'replace', path: '/kind', value: 'page' }],
      [{ op: 'add', path: '/deck/style/transition', value: 'spin' }],
    ]) {
      const error = await errorOf('iterate', 'talk', '--patch', patchFile('bad.json', ops));
      expect(error.code).toBe('validation');
    }
    expect(snapshot(dir)).toEqual(changed);

    const undone = await ok('undo', 'talk');
    expect(undone).toMatchObject({ kind: 'deck', undone: 1, remaining: 0 });
    const restored = snapshot(dir);
    delete restored['quick.json'];
    const original = { ...before };
    delete original['quick.json'];
    expect(restored).toEqual(original);
  });

  it('exports a single file from the deck page, and an artifact with the slides icon (AC)', async () => {
    await ok('--blueprint', DECK, '--slug', 'talk');
    const exported = await ok('export', 'talk', '--single-file');
    expect(exported).toMatchObject({ kind: 'deck', entry: 'deck', budgetBytes: 2 * 1024 * 1024 });
    const html = readFileSync(join(ws.root, exported.file as string), 'utf8');
    expect(html).toContain('data-py-chunk="deck.js"');
    expect(html).not.toContain('data-py-chunk="app.js"');
    expect(html).toContain('"kind":"deck"');

    const artifact = await ok('export', 'talk', '--target', 'artifact');
    expect(artifact.kind).toBe('deck');
    expect(artifact.publish).toMatchObject({ icon: 'slides', title: 'Minimal deck' });
  });

  it('lists the kind, and live reload reads a deck identity', async () => {
    const { dir } = (await ok('--blueprint', DECK, '--slug', 'talk')) as { dir: string };
    const listed = (await ok('list')) as { explorations: { slug: string; kind: string }[] };
    expect(listed.explorations.find((entry) => entry.slug === 'talk')?.kind).toBe('deck');
    const identity = await readBlueprintIdentity(join(ws.root, dir, 'blueprint.json'));
    expect(identity?.namespace).toMatch(/^bp-/);
  });

  it('refuses to promote a deck, pointing at generate', async () => {
    await ok('--blueprint', DECK, '--slug', 'talk');
    const error = await errorOf('promote', 'talk', 'talk-deck');
    expect(error.code).toBe('usage');
    expect(error.hint).toContain('protoyard generate talk-deck --blueprint');
  });
});

describe('quick with pages and docs', () => {
  it('opens each on its own page and exports with its icon', async () => {
    for (const [file, kind, icon] of [
      [PAGE, 'page', 'page'],
      [DOC, 'doc', 'document'],
    ] as const) {
      const slug = `kind-${kind}`;
      const data = await ok('--blueprint', file, '--slug', slug, '--variants', '2');
      expect(data.kind).toBe(kind);
      expect(read(data.dir as string, 'index.html')).toContain(`${kind}.html#bp=`);
      for (const variant of data.variants as { id: string }[]) {
        const blueprint = JSON.parse(read(data.dir as string, `${variant.id}/blueprint.json`));
        const base = JSON.parse(read(data.dir as string, 'blueprint.json'));
        expect({ ...blueprint, brand: undefined }).toEqual({ ...base, brand: undefined });
      }
      const artifact = await ok('export', slug, '--target', 'artifact');
      expect(artifact.publish).toMatchObject({ icon });
      const single = await ok('export', slug, '--single-file');
      expect(single.entry).toBe(kind);
    }
  });
});

describe('quick on a player without kind pages', () => {
  it('opens and exports a deck from index.html', async () => {
    await usePlayer(false);
    const data = await ok('--blueprint', DECK, '--slug', 'talk');
    expect(read(data.dir as string, 'index.html')).toMatch(/index\.html#bp=/);
    const exported = await ok('export', 'talk', '--single-file');
    expect(exported.entry).toBe('index');
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
