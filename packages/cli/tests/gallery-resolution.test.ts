// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GALLERY_PACKAGE, requireGalleryDir, resolveGalleryDir } from '../src/commands/serve.ts';
import { cli } from './helpers.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-gallery-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, content: string | object) {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(
    file,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
  );
}

/** A consumer workspace (no pnpm-workspace.yaml) with the gallery installed under node_modules. */
function consumerWithGallery(options: { symlinked?: boolean } = {}) {
  write('package.json', { name: 'my-prototypes', private: true, protoyard: {} });
  const real = options.symlinked
    ? '.pnpm/gallery/node_modules/@protoyard/gallery'
    : 'node_modules/@protoyard/gallery';
  write(`${options.symlinked ? 'node_modules/' : ''}${real}/package.json`, {
    name: GALLERY_PACKAGE,
    version: '1.0.0',
  });
  write(
    `${options.symlinked ? 'node_modules/' : ''}${real}/astro.config.mjs`,
    'export default {};\n'
  );
  if (options.symlinked) {
    mkdirSync(join(root, 'node_modules/@protoyard'), { recursive: true });
    symlinkSync(join(root, 'node_modules', real), join(root, 'node_modules/@protoyard/gallery'));
    return join(root, 'node_modules', real);
  }
  return join(root, real);
}

describe('resolveGalleryDir', () => {
  it('finds the installed @protoyard/gallery package in a consumer workspace', () => {
    const dir = consumerWithGallery();
    expect(resolveGalleryDir(root, { fromDirs: [root] })).toEqual({ dir, source: 'package' });
  });

  it('follows package-manager symlinks to the real folder', () => {
    const dir = consumerWithGallery({ symlinked: true });
    expect(resolveGalleryDir(root, { fromDirs: [root] })).toEqual({ dir, source: 'package' });
  });

  it("falls back to this repository's apps/gallery", () => {
    write('apps/gallery/package.json', { name: GALLERY_PACKAGE });
    write('apps/gallery/astro.config.mjs', 'export default {};\n');
    expect(resolveGalleryDir(root, { fromDirs: [root] })).toEqual({
      dir: join(root, 'apps/gallery'),
      source: 'workspace',
    });
  });

  it('finds the real gallery in this repository', () => {
    const found = resolveGalleryDir(REPO_ROOT);
    expect(found?.dir).toBe(realpathSync(join(REPO_ROOT, 'apps/gallery')));
  });

  it('ignores folders that are not the gallery', () => {
    write('node_modules/@protoyard/gallery/package.json', { name: 'someone-else' });
    write('node_modules/@protoyard/gallery/astro.config.mjs', 'export default {};\n');
    write('apps/gallery/package.json', { name: GALLERY_PACKAGE });
    expect(resolveGalleryDir(root, { fromDirs: [root] })).toBeNull();
    expect(() => requireGalleryDir(root, { fromDirs: [root] })).toThrow(/is not installed/);
  });
});

describe('protoyard gallery in a consumer workspace', () => {
  it('runs Astro from the installed package with this workspace registry and caches', async () => {
    const dir = consumerWithGallery();
    // A stand-in Astro binary records how it was started, then exits.
    write('node_modules/@protoyard/gallery/node_modules/astro/package.json', {
      name: 'astro',
      version: '0.0.0',
      bin: { astro: 'bin.mjs' },
    });
    write(
      'node_modules/@protoyard/gallery/node_modules/astro/bin.mjs',
      `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.FAKE_ASTRO_OUT, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), registry: process.env.PROTOYARD_REGISTRY, cache: process.env.PROTOYARD_GALLERY_CACHE_DIR }));
`
    );
    const out = join(root, 'astro-run.json');
    const run = await cli(
      ['--root', root, '--json', 'gallery', '--port', '4839', '--control-port', '4838'],
      { FAKE_ASTRO_OUT: out }
    );
    expect(run.code, run.stderr).toBe(0);
    const started = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
    expect(realpathSync(started.cwd as string)).toBe(dir);
    expect(started.args).toEqual(['dev', '--ignore-lock', '--port', '4839', '--host', '127.0.0.1']);
    expect(started.registry).toBe(join(root, '.protoyard/registry.json'));
    expect(started.cache).toBe(join(root, '.protoyard/gallery-cache'));
    expect(run.json<{ data: { gallery: string } }>().data.gallery).toBe('http://localhost:4839/');
  });

  it('explains how to install the gallery when it is missing', () => {
    write('package.json', { name: 'my-prototypes', private: true, protoyard: {} });
    let message = '';
    try {
      requireGalleryDir(root, { fromDirs: [root] });
    } catch (error) {
      message = `${(error as Error).message} ${(error as { hint?: string }).hint ?? ''}`;
    }
    expect(message).toMatch(/@protoyard\/gallery/);
    expect(message).toMatch(/pnpm add -D @protoyard\/gallery/);
  });
});
