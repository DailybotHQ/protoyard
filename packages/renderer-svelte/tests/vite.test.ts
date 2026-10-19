import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseManifest } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  defineProtoyardConfig,
  devFsAllow,
  envFlag,
  resolveProtoyardSettings,
  VITE_MANIFEST_PATH,
} from '../src/vite.ts';

const manifest = parseManifest({
  id: 'example.crm',
  slug: 'crm-demo',
  name: 'CRM',
  version: '1.2.3',
  storage: { namespace: 'crm-demo', schemaVersion: 1 },
});

describe('resolveProtoyardSettings', () => {
  it('uses relocatable defaults for builds and always enables DevTools in dev', () => {
    const build = resolveProtoyardSettings(manifest, 'build', {}, '/proj');
    expect(build).toMatchObject({ base: './', includeDevtools: false, demoBadge: true });
    expect(build.outDir).toBe(resolve('/proj', 'dist'));
    const dev = resolveProtoyardSettings(manifest, 'serve', {}, '/proj');
    expect(dev).toMatchObject({ includeDevtools: true, demoBadge: false });
    expect(dev.build.mode).toBe('dev');
  });

  it('lets the CLI drive everything through env vars', () => {
    const s = resolveProtoyardSettings(
      manifest,
      'build',
      {
        PROTOYARD_BASE: '/protos/crm/',
        PROTOYARD_OUT_DIR: '/out/crm-demo/dist',
        PROTOYARD_INCLUDE_DEVTOOLS: 'true',
        PROTOYARD_DEMO_BADGE: '0',
        PROTOYARD_PORT: '5199',
        PROTOYARD_BUILT_AT: '2026-10-17T00:00:00.000Z',
      },
      '/proj'
    );
    expect(s).toMatchObject({
      base: '/protos/crm/',
      outDir: resolve('/out/crm-demo/dist'),
      includeDevtools: true,
      demoBadge: false,
      port: 5199,
    });
    expect(s.build).toEqual({
      id: 'example.crm',
      slug: 'crm-demo',
      version: '1.2.3',
      namespace: 'crm-demo',
      builtAt: '2026-10-17T00:00:00.000Z',
      mode: 'build',
      offline: false,
      frameWhenEmbedded: false,
    });
    expect(
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_FRAME_WHEN_EMBEDDED: '1' }, '/proj')
        .build.frameWhenEmbedded
    ).toBe(true);
    expect(
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_OFFLINE: '1' }, '/proj').offline
    ).toBe(true);
    expect(
      resolveProtoyardSettings(manifest, 'serve', { PROTOYARD_OFFLINE: '1' }, '/proj').offline
    ).toBe(false);
    expect(
      resolveProtoyardSettings(
        manifest,
        'serve',
        { PROTOYARD_STORAGE_NAMESPACE: 'template-demo-blank' },
        '/proj'
      ).build.namespace
    ).toBe('template-demo-blank');
    expect(envFlag('maybe')).toBeUndefined();
  });

  it('rejects a PROTOYARD_STORAGE_NAMESPACE that is not a valid namespace', () => {
    const resolveWith = (value: string) =>
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_STORAGE_NAMESPACE: value }, '/proj')
        .build.namespace;
    // Blank falls back to the manifest namespace.
    expect(resolveWith('  ')).toBe(manifest.storage.namespace);
    for (const bad of [
      'x</script><script>alert(1)</script>',
      'other.prototype',
      'Upper-Case',
      '1starts-with-digit',
      'a',
      `a${'b'.repeat(64)}`,
    ]) {
      expect(() => resolveWith(bad), bad).toThrow(/PROTOYARD_STORAGE_NAMESPACE/);
    }
  });
});

describe('defineProtoyardConfig', () => {
  it('reads protoyard.json from root and produces a complete Vite config', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-vite-'));
    writeFileSync(join(root, 'protoyard.json'), JSON.stringify(manifest));
    const factory = defineProtoyardConfig({ root, build: { sourcemap: true } });
    const config = factory({
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    });
    expect(config.root).toBe(root);
    expect(config.base).toBe('./');
    expect(config.build?.emptyOutDir).toBe(true);
    expect(config.build?.sourcemap).toBe(true);
    // The CLI's bundle analysis reads this manifest and removes it from dist.
    expect(config.build?.manifest).toBe(VITE_MANIFEST_PATH);
    expect(config.define?.__PROTOYARD_DEVTOOLS__).toBe('false');
    expect(JSON.parse(config.define?.__PROTOYARD_BUILD__ as string).slug).toBe('crm-demo');
    expect(config.server?.strictPort).toBe(false);
  });

  it('fails with an actionable message when the manifest is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-vite-'));
    const factory = defineProtoyardConfig({ root });
    expect(() =>
      factory({ command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false })
    ).toThrow(/protoyard.json not found/);
  });
});

describe('dev server file access', () => {
  it('allows only the prototype, workspace packages and dependencies', () => {
    const workspace = resolve(import.meta.dirname, '../../..');
    const root = resolve(workspace, 'templates/blank');
    expect(devFsAllow(root)).toEqual([
      root,
      resolve(workspace, 'packages'),
      resolve(workspace, 'node_modules'),
    ]);
  });
});
