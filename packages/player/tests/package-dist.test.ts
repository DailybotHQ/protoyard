// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { entryClosure, packageDist } from '../scripts/package-dist.ts';

/**
 * `build:packages` compiles all of src/ with svelte-package; the package's
 * postBuild trims dist/ to the published entries (./embed and ./boot) and
 * leaves the Vite app in dist/app/ alone.
 */

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function rawDist(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'protoyard-player-dist-'));
  roots.push(dist);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    writeFileSync(join(dist, path), text);
  }
  return dist;
}

const RAW = {
  'app/index.html': '<!doctype html>\n',
  'app/assets/main.js': 'export {};\n',
  'embed/index.js': "export * from './client.js';\n",
  'embed/index.d.ts': "export * from './client.ts';\n",
  'embed/client.js': 'export const connect = () => {};\n',
  'embed/client.d.ts': 'export declare const connect: () => void;\n',
  'boot.js': [
    "import { cache } from './cache/index.js';",
    "import PlayerApp from './PlayerApp.svelte';",
    'export function boot() {',
    "  return [cache, PlayerApp, new Worker(new URL('./worker/run.worker.ts', import.meta.url))];",
    '}',
    "export const lazy = () => import('./lazy.js');",
    '',
  ].join('\n'),
  'boot.d.ts':
    "import { type Cache } from './cache/index.ts';\nexport declare function boot(): Cache;\n",
  'cache/index.js': 'export const cache = 1;\n',
  'cache/index.d.ts': "import type { Shape } from '../types.ts';\nexport type Cache = Shape;\n",
  'types.d.ts': 'export type Shape = number;\n',
  'PlayerApp.svelte': "<script>\nimport Panel from './Panel.svelte';\n</script>\n<Panel />\n",
  'PlayerApp.svelte.d.ts': 'export default {};\n',
  'Panel.svelte': '<p>panel</p>\n',
  'lazy.js': 'export default 1;\n',
  'worker/run.worker.js': "import '../cache/index.js';\n",
  'main.js': "import './boot.js';\n",
  'main.d.ts': 'export {};\n',
  'fixtures/demo.blueprint.json': '{}\n',
  'app.css': 'body{}\n',
  'entries/deck.js': 'export {};\n',
};

describe('player package dist', () => {
  it('keeps exactly what ./embed and ./boot import, in dist/embed and dist/boot', () => {
    const dist = rawDist(RAW);
    const result = packageDist(dist);
    expect(result.kept).toEqual(
      [
        'boot/PlayerApp.svelte',
        'boot/PlayerApp.svelte.d.ts',
        'boot/Panel.svelte',
        'boot/boot.d.ts',
        'boot/boot.js',
        'boot/cache/index.d.ts',
        'boot/cache/index.js',
        'boot/lazy.js',
        'boot/types.d.ts',
        'boot/worker/run.worker.js',
        'embed/client.d.ts',
        'embed/client.js',
        'embed/index.d.ts',
        'embed/index.js',
      ].sort()
    );
    expect(result.removed).toEqual(
      [
        'app.css',
        'boot.d.ts',
        'boot.js',
        'cache/index.d.ts',
        'cache/index.js',
        'entries/deck.js',
        'fixtures/demo.blueprint.json',
        'lazy.js',
        'main.d.ts',
        'main.js',
        'PlayerApp.svelte',
        'PlayerApp.svelte.d.ts',
        'Panel.svelte',
        'types.d.ts',
        'worker/run.worker.js',
      ].sort()
    );
    for (const file of result.kept) expect(existsSync(join(dist, file)), file).toBe(true);
    for (const gone of [
      'main.js',
      'boot.js',
      'fixtures',
      'entries',
      'app.css',
      '.package-staging',
    ]) {
      expect(existsSync(join(dist, gone)), gone).toBe(false);
    }
    // The Vite app is untouched.
    expect(readFileSync(join(dist, 'app/index.html'), 'utf8')).toBe('<!doctype html>\n');
    expect(existsSync(join(dist, 'app/assets/main.js'))).toBe(true);
    // The worker URL points at the emitted .js.
    expect(result.rewritten).toEqual(['boot.js']);
    expect(readFileSync(join(dist, 'boot/boot.js'), 'utf8')).toContain(
      "new URL('./worker/run.worker.js', import.meta.url)"
    );
  });

  it('refuses an entry that imports a file the build did not emit', () => {
    const dist = rawDist({
      'embed/index.js': 'export {};\n',
      'boot.js': "import './missing.js';\n",
    });
    expect(() => entryClosure(dist, 'boot.js')).toThrow(/missing\.js, which the package build/);
    expect(() => packageDist(dist)).toThrow(/did not emit/);
    // Nothing was deleted when the closure failed.
    expect(existsSync(join(dist, 'boot.js'))).toBe(true);
  });

  it('refuses an embed entry that reaches outside dist/embed', () => {
    const dist = rawDist({
      'embed/index.js': "import '../shared.js';\n",
      'shared.js': 'export {};\n',
      'boot.js': 'export {};\n',
    });
    expect(() => packageDist(dist)).toThrow(/outside its embed\/ folder/);
  });
});
