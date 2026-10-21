// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(import.meta.dirname, '../dist/app');

function emittedFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return emittedFiles(path, relative);
    return statSync(path).isFile() ? [relative] : [];
  });
}

function offlineConfig(): { precache: string[]; hashed: string[] } {
  const source = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const match = /^const CONFIG = (\{.*\});$/m.exec(source);
  expect(match, 'generated service worker config').not.toBeNull();
  return JSON.parse(match?.[1] ?? '{}') as { precache: string[]; hashed: string[] };
}

describe('player offline build', () => {
  it('emits a valid install manifest and the kill-switch register script', () => {
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest).toMatchObject({
      name: 'Protoyard player',
      short_name: 'Protoyard',
      start_url: './',
      scope: './',
      display: 'standalone',
    });
    expect(manifest.icons).toEqual([
      expect.objectContaining({ src: './favicon.svg', type: 'image/svg+xml' }),
    ]);

    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('data-protoyard-offline');
    expect(html).toContain("get('offline') === '0'");
    expect(html).toContain('reg.unregister()');
  });

  it('precaches every emitted player file except the generated worker', () => {
    const config = offlineConfig();
    // `_headers` is host configuration (the CSP header) and the assets manifest
    // is `protoyard quick`'s checksum list, written after the worker; neither
    // is a page resource.
    const files = emittedFiles(DIST).filter(
      (file) =>
        file !== 'sw.js' &&
        file !== '_headers' &&
        file !== 'protoyard-player-assets.json' &&
        !file.startsWith('.') &&
        !file.includes('/.')
    );
    const precache = new Set(config.precache.map((file) => file.replace(/^\.\//, '')));

    expect(config.precache[0]).toBe('./');
    expect(files.filter((file) => file.endsWith('.js'))).not.toHaveLength(0);
    for (const file of files) expect(precache.has(file), file).toBe(true);
  });
});
