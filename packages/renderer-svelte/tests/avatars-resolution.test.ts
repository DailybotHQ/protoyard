// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { avatarAssetsDir, listAvatarFiles } from '../src/avatars-plugin.ts';

/**
 * The renderer finds the avatar library by package resolution, never by a
 * sibling folder, so builds work from the monorepo, from a packed dist and
 * from a consumer's node_modules (ADR-028).
 */

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  // Canonical path: /var → /private/var on macOS must not break comparisons.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-avatar-resolve-')));
  roots.push(root);
  return root;
}

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
}

/**
 * A published-shaped avatars package: dist entry only, `./package.json` NOT
 * exported (the resolver must walk up from the entry), one image per size.
 */
function avatarsPackage(dir: string, exportsMap: object = { '.': { default: './dist/index.js' } }) {
  write(join(dir, 'package.json'), {
    name: '@protoyard/avatars',
    version: '1.0.0',
    type: 'module',
    exports: exportsMap,
  });
  write(join(dir, 'dist', 'index.js'), 'export const AVATAR_COUNT = 175;\n');
  // An unrelated nested manifest on the walk up must not stop it.
  write(join(dir, 'dist', 'package.json'), { type: 'module' });
  for (const size of [64, 128]) write(join(dir, 'assets', String(size), 'av-001.webp'), 'RIFF');
}

/** A file inside a packed renderer: the module the resolver starts from. */
function rendererModule(dir: string): string {
  write(join(dir, 'package.json'), { name: '@protoyard/renderer-svelte', type: 'module' });
  const file = join(dir, 'dist', 'avatars-plugin.js');
  write(file, '');
  return pathToFileURL(file).href;
}

describe('avatarAssetsDir', () => {
  it('resolves the workspace package in this monorepo', () => {
    const expected = realpathSync(resolve(import.meta.dirname, '../../avatars/assets'));
    expect(realpathSync(avatarAssetsDir())).toBe(expected);
    expect(listAvatarFiles([64]).length).toBe(175);
  });

  it('finds the assets through a symlinked node_modules (pnpm layout)', () => {
    const root = tempRoot();
    // pnpm keeps real folders in the virtual store and links siblings next to them.
    const store = join(root, 'node_modules', '.pnpm', 'node_modules', '@protoyard');
    const real = join(root, 'node_modules', '.pnpm', '@protoyard+avatars@1.0.0', 'pkg');
    avatarsPackage(real);
    mkdirSync(store, { recursive: true });
    symlinkSync(real, join(store, 'avatars'), 'dir');
    const from = rendererModule(join(store, 'renderer-svelte'));

    const assets = avatarAssetsDir(from);
    expect(realpathSync(assets)).toBe(join(real, 'assets'));
    expect(listAvatarFiles([64, 128], assets).map((f) => f.fileName)).toEqual([
      'avatars/64/av-001.webp',
      'avatars/128/av-001.webp',
    ]);
  });

  it('finds the assets in a flat consumer node_modules (npm layout)', () => {
    const root = tempRoot();
    const modules = join(root, 'node_modules', '@protoyard');
    avatarsPackage(join(modules, 'avatars'));
    const from = rendererModule(join(modules, 'renderer-svelte'));
    expect(avatarAssetsDir(from)).toBe(join(modules, 'avatars', 'assets'));
  });

  it('uses an exported ./package.json directly when the package offers it', () => {
    const root = tempRoot();
    const modules = join(root, 'node_modules', '@protoyard');
    // No resolvable entry at all: only the manifest export can succeed.
    avatarsPackage(join(modules, 'avatars'), { './package.json': './package.json' });
    const from = rendererModule(join(modules, 'renderer-svelte'));
    expect(avatarAssetsDir(from)).toBe(join(modules, 'avatars', 'assets'));
  });

  it('fails with an actionable message when the package is not installed', () => {
    const root = tempRoot();
    const from = rendererModule(join(root, 'node_modules', '@protoyard', 'renderer-svelte'));
    // `pnpm vitest` puts the workspace's hoisted store on NODE_PATH, which Node
    // reads once at startup and would resolve the real package; a child
    // process without it sees only the fixture, like a consumer install.
    const plugin = pathToFileURL(resolve(import.meta.dirname, '../src/avatars-plugin.ts')).href;
    const script = `const { avatarAssetsDir } = await import(${JSON.stringify(plugin)});
try { avatarAssetsDir(${JSON.stringify(from)}); console.log('resolved'); }
catch (error) { console.log(error.message); }`;
    const env = { ...process.env };
    delete env.NODE_PATH;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/@protoyard\/avatars is not resolvable.*avatars: false/);
  });
});
