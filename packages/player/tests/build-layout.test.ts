// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { UserConfig } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { readPackageGraph } from '../../../scripts/lib/package-graph.ts';
import config, {
  PLAYER_APP_DIR,
  PLAYER_ASSETS_MANIFEST,
  playerAssetsManifest,
} from '../vite.config.ts';

/**
 * The player app builds into dist/app/ so the embed client's tsc build
 * (dist/embed/) and Vite never delete each other's output, and the build's
 * asset manifest follows the CLI's `protoyard.player-assets` contract.
 */

const PLAYER = resolve(import.meta.dirname, '..');
const REPO = resolve(PLAYER, '../..');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-player-layout-'));
  roots.push(dir);
  return dir;
}

describe('player build layout', () => {
  it('builds the app into dist/app, which only Vite empties', async () => {
    const previous = process.env.PROTOYARD_OUT_DIR;
    delete process.env.PROTOYARD_OUT_DIR;
    try {
      const resolved = (await config({ command: 'build', mode: 'production' })) as UserConfig;
      expect(PLAYER_APP_DIR).toBe('dist/app');
      expect(resolved.build?.outDir).toBe(join(PLAYER, 'dist', 'app'));
      expect(resolved.build?.emptyOutDir).toBe(true);
      expect(resolved.worker?.format).toBe('es');
    } finally {
      if (previous !== undefined) process.env.PROTOYARD_OUT_DIR = previous;
    }
  });

  it('has build:packages keep dist/app when it cleans dist/ for the embed client', () => {
    const player = readPackageGraph(REPO).byName.get('@protoyard/player');
    expect(player?.buildConfig).toBe('tsc');
    expect(player?.keep).toEqual(['app']);
  });
});

describe('player assets manifest', () => {
  it('lists every file but itself, sorted, with size and sha256', () => {
    const app = temp();
    writeFileSync(join(app, 'index.html'), '<!doctype html>\n');
    writeFileSync(join(app, '_headers'), '/*\n');
    mkdirSync(join(app, 'assets'));
    writeFileSync(join(app, 'assets', 'b.js'), 'b');
    writeFileSync(join(app, 'assets', 'a.js'), '');
    mkdirSync(join(app, '.vite'));
    writeFileSync(join(app, '.vite', 'manifest.json'), '{}');
    writeFileSync(join(app, PLAYER_ASSETS_MANIFEST), '{}');

    const manifest = playerAssetsManifest(app, '1.2.3');

    expect(manifest).toMatchObject({
      format: 'protoyard.player-assets',
      version: 1,
      player: '1.2.3',
    });
    expect(manifest.files.map((file) => file.path)).toEqual([
      '.vite/manifest.json',
      '_headers',
      'assets/a.js',
      'assets/b.js',
      'index.html',
    ]);
    expect(manifest.files.find((file) => file.path === 'assets/a.js')).toEqual({
      path: 'assets/a.js',
      size: 0,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
  });

  it('refuses links and a build without index.html', () => {
    const linked = temp();
    writeFileSync(join(linked, 'index.html'), '');
    symlinkSync(join(linked, 'index.html'), join(linked, 'alias.html'));
    expect(() => playerAssetsManifest(linked, '1.0.0')).toThrow(/link or special file: alias.html/);

    const empty = temp();
    writeFileSync(join(empty, 'other.html'), '');
    expect(() => playerAssetsManifest(empty, '1.0.0')).toThrow(/no index.html/);
  });
});
