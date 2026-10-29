import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseManifest } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  defineProtoyardConfig,
  devFsAllow,
  envFlag,
  isEagerModule,
  linkedPackageRoots,
  resolveProtoyardSettings,
  TEXULI_CSS_GROUP,
  TEXULI_CSS_MODULE,
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
    expect(config.define?.__PROTOYARD_REVIEW__).toBe('false');
    expect(JSON.parse(config.define?.__PROTOYARD_BUILD__ as string).slug).toBe('crm-demo');
    expect(config.server?.strictPort).toBe(false);
  });

  it('resolves the manifest review flag and PROTOYARD_REVIEW override without exposing endpoints', () => {
    const configured = parseManifest({
      ...manifest,
      build: { review: { enabled: true, adapter: 'http', endpoint: '/api/comments' } },
    });
    expect(resolveProtoyardSettings(configured, 'build', {}, '/proj').reviewEnabled).toBe(true);
    expect(
      resolveProtoyardSettings(configured, 'build', { PROTOYARD_REVIEW: '0' }, '/proj')
        .reviewEnabled
    ).toBe(false);
    expect(
      resolveProtoyardSettings(manifest, 'build', { PROTOYARD_REVIEW: '1' }, '/proj').reviewEnabled
    ).toBe(true);
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
  it('allows only the prototype, workspace packages, dependencies and linked packages', () => {
    const workspace = resolve(import.meta.dirname, '../../..');
    const root = resolve(workspace, 'templates/blank');
    expect(devFsAllow(root)).toEqual([
      root,
      resolve(workspace, 'packages'),
      resolve(workspace, 'node_modules'),
      ...linkedPackageRoots(workspace),
    ]);
  });

  it('adds the real folder of each link: dependency, and nothing for anything else', () => {
    const base = mkdtempSync(join(tmpdir(), 'protoyard-links-'));
    try {
      const workspace = join(base, 'protoyard');
      const linked = join(base, 'texuli', 'packages', 'core');
      mkdirSync(workspace, { recursive: true });
      mkdirSync(linked, { recursive: true });
      writeFileSync(
        join(workspace, 'package.json'),
        JSON.stringify({
          dependencies: { '@texuli/core': 'link:../texuli/packages/core', svelte: '^5.0.0' },
          devDependencies: {
            '@texuli/missing': 'link:../texuli/packages/missing',
            '@protoyard/core': 'workspace:*',
            '@texuli/again': 'link:../texuli/packages/core',
          },
        })
      );
      expect(linkedPackageRoots(workspace)).toEqual([realpathSync(linked)]);
      writeFileSync(join(workspace, 'package.json'), '{ not json');
      expect(linkedPackageRoots(workspace)).toEqual([]);
      expect(linkedPackageRoots(join(base, 'nowhere'))).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('adds no extra roots for this workspace, which installs Texuli from npm', () => {
    const workspace = resolve(import.meta.dirname, '../../..');
    expect(linkedPackageRoots(workspace)).toEqual([]);
  });
});

describe('Texuli CSS chunk group', () => {
  it('matches CSS from texuli and @texuli/*, linked or installed, and nothing else', () => {
    for (const id of [
      '/w/texuli/packages/texuli/src/components/button/button.css',
      '/w/texuli/packages/tokens/dist/tokens.css?inline',
      '/p/node_modules/texuli/dist/styles.css',
      '/p/node_modules/@texuli/charts/dist/charts.css',
      'C:\\p\\node_modules\\@texuli\\data\\dist\\grid.css',
      '/w/texuli/packages/texuli/src/Button.svelte?svelte&type=style&lang.css',
    ]) {
      expect(TEXULI_CSS_MODULE.test(id), id).toBe(true);
    }
    for (const id of [
      '/w/texuli/packages/texuli/src/button.ts',
      '/p/node_modules/@texuli/charts/dist/index.js',
      '/p/packages/ui/src/app.css',
      '/p/node_modules/texuli-like/dist/styles.css',
      '/p/node_modules/@other/texuli/dist/styles.css',
    ]) {
      expect(TEXULI_CSS_MODULE.test(id), id).toBe(false);
    }
  });

  it('adds one group to regular builds and none to the artifact target', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-vite-'));
    writeFileSync(join(root, 'protoyard.json'), JSON.stringify(manifest));
    const env = {
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    } as const;
    const groupsOf = () =>
      (
        defineProtoyardConfig({ root })(env).build?.rolldownOptions?.output as {
          codeSplitting?: { groups?: unknown[] };
        }
      )?.codeSplitting?.groups ?? [];
    expect(groupsOf()).toEqual([TEXULI_CSS_GROUP]);
    const previous = process.env.PROTOYARD_TARGET;
    process.env.PROTOYARD_TARGET = 'artifact';
    try {
      expect(groupsOf()).not.toContain(TEXULI_CSS_GROUP);
    } finally {
      if (previous === undefined) delete process.env.PROTOYARD_TARGET;
      else process.env.PROTOYARD_TARGET = previous;
    }
  });

  it('leaves Texuli CSS to the default split with texuliCssGroups: false', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-vite-'));
    writeFileSync(join(root, 'protoyard.json'), JSON.stringify(manifest));
    const env = {
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    } as const;
    const output = defineProtoyardConfig({ root, texuliCssGroups: false })(env).build
      ?.rolldownOptions?.output as { codeSplitting?: { groups?: unknown[] } } | undefined;
    expect(output?.codeSplitting?.groups ?? []).not.toContain(TEXULI_CSS_GROUP);
  });

  it('puts eager Texuli CSS in texuli-css and lazy family CSS in texuli-lazy-css', () => {
    // entry -> shell.svelte -> shell style (eager); entry -> import() -> family.svelte
    // -> family style (lazy); orphan has no importer at all.
    const modules: Record<string, { isEntry: boolean; importers: string[] }> = {
      entry: { isEntry: true, importers: [] },
      'shell.svelte': { isEntry: false, importers: ['entry'] },
      'shell.svelte?svelte&type=style&lang.css': { isEntry: false, importers: ['shell.svelte'] },
      'family.svelte': { isEntry: false, importers: [] },
      'family.svelte?svelte&type=style&lang.css': { isEntry: false, importers: ['family.svelte'] },
      'cycle-a.css': { isEntry: false, importers: ['cycle-b.css'] },
      'cycle-b.css': { isEntry: false, importers: ['cycle-a.css'] },
    };
    const graph = { getModuleInfo: (id: string) => modules[id] ?? null };
    expect(isEagerModule('shell.svelte?svelte&type=style&lang.css', graph)).toBe(true);
    expect(isEagerModule('family.svelte?svelte&type=style&lang.css', graph)).toBe(false);
    expect(isEagerModule('cycle-a.css', graph)).toBe(false);
    expect(isEagerModule('missing.css', graph)).toBe(false);
    expect(TEXULI_CSS_GROUP.name('shell.svelte?svelte&type=style&lang.css', graph)).toBe(
      'texuli-css'
    );
    expect(TEXULI_CSS_GROUP.name('family.svelte?svelte&type=style&lang.css', graph)).toBe(
      'texuli-lazy-css'
    );
  });
});
