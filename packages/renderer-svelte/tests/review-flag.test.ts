import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseManifest } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { resolveProtoyardSettings } from '../src/vite.ts';

const root = resolve(import.meta.dirname, '../../..');
const manifest = parseManifest({
  id: 'example.review-flag',
  slug: 'review-flag',
  name: 'Review flag',
  version: '1.0.0',
  storage: { namespace: 'review-flag', schemaVersion: 1 },
});

describe('review build flag', () => {
  it('defaults to off and can be enabled by the manifest or PROTOYARD_REVIEW=1', () => {
    expect(resolveProtoyardSettings(manifest, 'build', {}, root).reviewEnabled).toBe(false);
    const configured = parseManifest({
      ...manifest,
      build: { review: { enabled: true, adapter: 'local' } },
    });
    expect(resolveProtoyardSettings(configured, 'build', {}, root).reviewEnabled).toBe(true);
    expect(
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_REVIEW: '1' }, root).reviewEnabled
    ).toBe(true);
  });

  it('bakes a PROTOYARD_REVIEW_ADAPTER override into the build info, checked by the schema', () => {
    const plain = resolveProtoyardSettings(manifest, 'build', {}, root);
    expect(plain.build.review).toBeUndefined();
    const http = resolveProtoyardSettings(
      manifest,
      'build',
      {
        PROTOYARD_REVIEW: '1',
        PROTOYARD_REVIEW_ADAPTER: 'http',
        PROTOYARD_REVIEW_ENDPOINT: '/api/comments',
      },
      root
    );
    expect(http.reviewEnabled).toBe(true);
    expect(http.build.review).toEqual({ adapter: 'http', endpoint: '/api/comments' });
    expect(
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_REVIEW_ADAPTER: 'cloudflare' }, root)
        .build.review
    ).toEqual({ adapter: 'cloudflare', endpoint: '/api/comments' });
    expect(() =>
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_REVIEW_ADAPTER: 'http' }, root)
    ).toThrow(/PROTOYARD_REVIEW_ADAPTER/);
    expect(() =>
      resolveProtoyardSettings(
        manifest,
        'build',
        { PROTOYARD_REVIEW_ADAPTER: 'http', PROTOYARD_REVIEW_ENDPOINT: 'https://x.example/?key=1' },
        root
      )
    ).toThrow(/PROTOYARD_REVIEW_ADAPTER/);
  });

  it('keeps the review package reachable through one guarded dynamic renderer import', () => {
    const mount = readFileSync(resolve(root, 'packages/renderer-svelte/src/mount.ts'), 'utf8');
    const sources = [
      'packages/renderer-svelte/src/mount.ts',
      'packages/renderer-svelte/src/vite.ts',
      'packages/renderer-svelte/src/flags.ts',
      'packages/renderer-svelte/src/env.d.ts',
    ].map((path) => readFileSync(resolve(root, path), 'utf8'));
    const staticImports = sources.join('\n').match(/from\s+['"]@protoyard\/review-ui\//g) ?? [];
    expect(staticImports).toEqual([]);
    expect(mount.match(/await import\(['"]@protoyard\/review-ui\/mount['"]\)/g)).toHaveLength(1);
    expect(mount).toMatch(
      /typeof __PROTOYARD_REVIEW__ !== 'undefined'\s*\?\s*__PROTOYARD_REVIEW__/
    );
  });
});
