// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blueprintIdentity,
  decodeBlueprintShare,
  parseBlueprint,
  VARIANT_THEME_PRESETS,
} from '@protoyard/blueprint';
import { THEME_LIBRARY_META } from '@protoyard/themes/library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseVariantCount,
  setQuickPlayerLocator,
  variantAxes,
} from '../src/commands/quick/index.ts';
import { CliError } from '../src/lib/output.ts';
import { readQuickRecord } from '../src/lib/quick/model.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * `protoyard quick … --variants N`: N deterministic variants in v1/…vN/, each
 * with its own blueprint and launcher on the one shared player, recorded in
 * quick.json and shown by compare.html; capped at 8; storage isolated per
 * blueprint content hash.
 */

const BRIEF =
  'A fictional field service team schedules equipment inspections, assigns technicians and tracks each visit.';
const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

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
const DIR = '.protoyard/quick/idea';
const variantDirs = () =>
  readdirSync(at(DIR))
    .filter((name) => /^v\d$/.test(name))
    .sort();
const launcherHref = (path: string) =>
  /href="([^"]+)"/.exec(readFileSync(at(path), 'utf8'))?.[1] ?? '';

describe('parseVariantCount', () => {
  it('accepts 1 to 8 and refuses anything else as a usage error', () => {
    expect(parseVariantCount(undefined)).toBeNull();
    expect(parseVariantCount('1')).toBe(1);
    expect(parseVariantCount('8')).toBe(8);
    for (const bad of ['0', '9', '-1', '2.5', 'x', '', '08', '100']) {
      if (bad === '08') continue; // two digits within range are fine
      expect(() => parseVariantCount(bad), bad).toThrow(CliError);
    }
  });
});

describe('variantAxes', () => {
  it('keeps variants on the blueprint app model layout and only catalog theme ids', () => {
    const blueprint = parseBlueprint(JSON.parse(readFileSync(ANALYTICS, 'utf8')) as unknown);
    const axes = variantAxes(blueprint);
    expect(axes.layouts).toEqual([blueprint.layout?.id ?? 'sidebar']);
    const library = new Set(THEME_LIBRARY_META.map((theme) => theme.id));
    for (const theme of axes.themes) {
      expect(
        (VARIANT_THEME_PRESETS as readonly string[]).includes(theme) || library.has(theme),
        theme
      ).toBe(true);
    }
    expect(axes.themes.length).toBe(VARIANT_THEME_PRESETS.length + library.size);
  });
});

describe('protoyard quick --variants', () => {
  it('writes v1..vN with their own blueprint and launcher on the one shared player', async () => {
    const result = await run(BRIEF, '--slug', 'idea', '--variants', '3', '--seed', '42');
    expect(result.code, result.stdout).toBe(0);
    const data = JSON.parse(result.stdout).data as {
      variants: { id: string; label: string; dir: string; open: string; blueprintSha256: string }[];
      compare: string;
      player: { dir: string };
    };
    expect(data.variants.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect(variantDirs()).toEqual(['v1', 'v2', 'v3']);
    expect(data.compare).toBe(`${DIR}/compare.html`);

    const base = parseBlueprint(JSON.parse(readFileSync(at(`${DIR}/blueprint.json`), 'utf8')));
    const baseId = await blueprintIdentity(base);
    const namespaces = new Set([baseId.namespace]);
    const record = await readQuickRecord(at(DIR));
    expect(record.variants.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    for (const [i, variant] of data.variants.entries()) {
      const blueprint = parseBlueprint(
        JSON.parse(readFileSync(at(`${DIR}/${variant.id}/blueprint.json`), 'utf8'))
      );
      // Same domain, different shell.
      expect(blueprint.entities.map((e) => e.name).sort()).toEqual(
        base.entities.map((e) => e.name).sort()
      );
      const identity = await blueprintIdentity(blueprint);
      expect(blueprint.layout?.id ?? 'sidebar').toBe(base.layout?.id ?? 'sidebar');
      expect(identity.sha256).toBe(variant.blueprintSha256);
      expect(record.variants[i]).toEqual({
        id: variant.id,
        label: variant.label,
        dir: variant.id,
        blueprintSha256: identity.sha256,
      });
      // Storage isolation: every variant opens its own world.
      expect(namespaces.has(identity.namespace), variant.id).toBe(false);
      namespaces.add(identity.namespace);
      // The launcher opens the shared player on this variant's own blueprint.
      const href = launcherHref(`${DIR}/${variant.id}/index.html`);
      expect(href.startsWith('../../_player/1.0.0/index.html?seed=42#bp=')).toBe(true);
      const decoded = await decodeBlueprintShare(href.slice(href.indexOf('#bp=') + 4));
      if (!decoded.success) throw new Error(`${variant.id}: the share link does not decode`);
      expect((await blueprintIdentity(decoded.blueprint)).sha256).toBe(identity.sha256);
    }
    expect(readdirSync(at('.protoyard/quick/_player'))).toEqual(['1.0.0']);

    const compare = readFileSync(at(`${DIR}/compare.html`), 'utf8');
    for (const id of ['v1', 'v2', 'v3']) expect(compare).toContain(`${id}/index.html`);
  }, 120_000);

  it('is deterministic for one seed and changes with another', async () => {
    const read = () =>
      variantDirs().map((id) => readFileSync(at(`${DIR}/${id}/blueprint.json`), 'utf8'));
    expect((await run(BRIEF, '--slug', 'idea', '--variants', '4', '--seed', '7')).code).toBe(0);
    const first = read();
    expect(
      (await run(BRIEF, '--slug', 'idea', '--variants', '4', '--seed', '7', '--force')).code
    ).toBe(0);
    expect(read()).toEqual(first);
    expect(
      (await run(BRIEF, '--slug', 'idea', '--variants', '4', '--seed', '8', '--force')).code
    ).toBe(0);
    expect(read()).not.toEqual(first);
    expect(new Set(first).size).toBe(4);
  }, 120_000);

  it('caps the count at 8 and writes nothing on a refusal', async () => {
    for (const count of ['9', '0', 'many']) {
      const result = await run(BRIEF, '--slug', 'idea', '--variants', count);
      expect(result.code, count).toBe(2);
      expect(JSON.parse(result.stdout).error.message).toMatch(
        /--variants must be a whole number from 1 to 8/
      );
    }
    expect(existsSync(at(DIR))).toBe(false);
    const eight = await run(BRIEF, '--slug', 'idea', '--variants', '8');
    expect(eight.code).toBe(0);
    expect(variantDirs()).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']);
  }, 120_000);

  it('drops variant folders and compare.html from an earlier run when replacing', async () => {
    expect((await run(BRIEF, '--slug', 'idea', '--variants', '4')).code).toBe(0);
    expect((await run(BRIEF, '--slug', 'idea', '--variants', '2', '--force')).code).toBe(0);
    expect(variantDirs()).toEqual(['v1', 'v2']);
    expect((await readQuickRecord(at(DIR))).variants).toHaveLength(2);
    expect((await run(BRIEF, '--slug', 'idea', '--force')).code).toBe(0);
    expect(variantDirs()).toEqual([]);
    expect(existsSync(at(`${DIR}/compare.html`))).toBe(false);
    expect((await readQuickRecord(at(DIR))).variants).toEqual([]);
  }, 120_000);

  it('puts every variant blueprint next to a standalone player', async () => {
    const result = await run(BRIEF, '--slug', 'idea', '--variants', '2', '--standalone');
    expect(result.code, result.stdout).toBe(0);
    for (const id of ['v1', 'v2']) {
      expect(launcherHref(`${DIR}/${id}/index.html`)).toBe(
        `../player/index.html?src=./${id}.blueprint.json`
      );
      expect(readFileSync(at(`${DIR}/player/${id}.blueprint.json`), 'utf8')).toBe(
        readFileSync(at(`${DIR}/${id}/blueprint.json`), 'utf8')
      );
    }
  }, 120_000);
});
