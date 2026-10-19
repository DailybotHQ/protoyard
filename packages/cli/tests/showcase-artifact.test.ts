// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertShowcaseArtifactLimit,
  packShowcaseArtifact,
  rewriteAstroRelativeBase,
  selectShowcaseEntries,
  showcaseAvatarBase,
} from '../src/commands/showcase.ts';
import type { RegistryEntry } from '../src/lib/registry.ts';

const roots: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

const entry = (kind: RegistryEntry['kind'], slug: string) => ({ kind, slug }) as RegistryEntry;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('showcase artifact target', () => {
  it('selects only requested demos and keeps templates opt-in', () => {
    const entries = [
      entry('prototype', 'one-app'),
      entry('prototype', 'two-app'),
      entry('template', 'starter'),
      entry('blueprint', 'bookings'),
    ];
    expect(
      selectShowcaseEntries(entries, { templates: false, slugs: ['two-app'] }).map(
        (item) => item.entry.slug
      )
    ).toEqual(['two-app']);
    expect(() => selectShowcaseEntries(entries, { templates: false, slugs: ['starter'] })).toThrow(
      /starter/
    );
    expect(showcaseAvatarBase('./', 'p/two-app/app/')).toBe('../../../avatars/');
    expect(rewriteAstroRelativeBase('href="/./_astro/app.js" url(/./images/a.svg)')).toBe(
      'href="./_astro/app.js" url(./images/a.svg)'
    );
  });

  it('splits a showcase pack into artifact publishes within the per-publish limit', async () => {
    const root = tempDir('protoyard-showcase-pack-');
    const distDir = join(root, 'site');
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(
      join(distDir, 'index.html'),
      '<!doctype html><html><head><title>Protoyard</title><script type="module" src="./assets/app.js"></script></head><body><main>Showcase</main></body></html>'
    );
    writeFileSync(join(distDir, 'assets', 'app.js'), 'export {};');
    for (let i = 0; i < 254; i++) {
      writeFileSync(join(distDir, 'assets', `demo-${String(i).padStart(3, '0')}.txt`), 'demo');
    }

    const manifest = await packShowcaseArtifact(distDir, join(root, 'artifact'));
    expect(manifest.files.length + 1).toBe(256);
    expect(
      manifest.batches.map((batch) => batch.files.length + (batch.index === 1 ? 1 : 0))
    ).toEqual([255, 1]);
    expect(
      manifest.batches.every((batch) => batch.files.length + (batch.index === 1 ? 1 : 0) <= 255)
    ).toBe(true);
  });

  it('packs the pre-rendered gallery index as an intentional static page', async () => {
    const root = tempDir('protoyard-showcase-static-');
    const distDir = join(root, 'site');
    mkdirSync(join(distDir, '_astro'), { recursive: true });
    writeFileSync(
      join(distDir, 'index.html'),
      '<!doctype html><html><head><title>Protoyard showcase</title><link rel="stylesheet" href="./_astro/site.css"></head><body><main><a href="./p/demo/app/">Open demo</a></main></body></html>'
    );
    writeFileSync(join(distDir, '_astro', 'site.css'), 'body { color: black; }');

    const manifest = await packShowcaseArtifact(distDir, join(root, 'artifact'));
    expect(manifest.files.map((file) => file.path)).toContain('_astro/site.css');
  });

  it('reports the exact over-limit count and suggests selecting slugs', () => {
    try {
      assertShowcaseArtifactLimit(512, ['one-app', 'two-app']);
      throw new Error('Expected the over-limit showcase to be refused.');
    } catch (error) {
      expect(error).toMatchObject({
        message: expect.stringContaining('has 512 files'),
        hint: expect.stringContaining('--slugs'),
      });
    }
  });
});
