// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appPathFor,
  assertShowcasePublishable,
  marketplacePathFor,
  publishShowcaseDirectory,
  showcaseEntries,
  showcaseRegistry,
} from '../src/commands/showcase.ts';
import { SHOWCASE_MARKER } from '../src/lib/output-guard.ts';
import type { Registry, RegistryEntry } from '../src/lib/registry.ts';
import { buildEnv } from '../src/lib/vite.ts';
import type { CommandContext } from '../src/lib/workspace.ts';
import type { PublishProvider } from '../src/publish/types.ts';
import { createWorkspace } from './helpers.ts';

const entry = (kind: RegistryEntry['kind'], slug: string) => ({ kind, slug }) as RegistryEntry;

describe('showcase', () => {
  it('places apps under their gallery detail pages', () => {
    expect(appPathFor(entry('prototype', 'crm-demo'))).toBe('p/crm-demo/app/');
    expect(appPathFor(entry('template', 'blank'))).toBe('t/blank/app/');
  });

  it('bundles every prototype and template demo by default, never blueprints', () => {
    const entries = [
      entry('prototype', 'crm-demo'),
      entry('template', 'chat-widget'),
      entry('blueprint', 'booking-scheduling'),
      entry('template', 'blank'),
    ];
    const all = showcaseEntries(entries, { templates: true });
    expect(
      all.map((e) => [e.entry.slug, e.appPath, e.marketplacePath, e.storageNamespace])
    ).toEqual([
      ['crm-demo', 'p/crm-demo/app/', 'marketplace/prototype/crm-demo/', undefined],
      [
        'chat-widget',
        't/chat-widget/app/',
        'marketplace/template/chat-widget/',
        'template-demo-chat-widget',
      ],
      ['blank', 't/blank/app/', 'marketplace/template/blank/', 'template-demo-blank'],
    ]);
    // --no-templates: prototypes only.
    expect(showcaseEntries(entries, { templates: false }).map((e) => e.entry.slug)).toEqual([
      'crm-demo',
    ]);
    expect(marketplacePathFor(entry('template', 'blank'))).toBe('marketplace/template/blank/');
  });

  it('builds a template demo with its demo namespace, and never inherits one', () => {
    const base = { outDir: '/tmp/out', base: '/t/blank/app/', includeDevtools: false };
    expect(
      buildEnv({ ...base, storageNamespace: 'template-demo-blank' }).PROTOYARD_STORAGE_NAMESPACE
    ).toBe('template-demo-blank');
    const previous = process.env.PROTOYARD_STORAGE_NAMESPACE;
    process.env.PROTOYARD_STORAGE_NAMESPACE = 'leaked-from-the-shell';
    try {
      // An empty value makes the renderer use the manifest's own namespace.
      expect(buildEnv(base).PROTOYARD_STORAGE_NAMESPACE).toBe('');
    } finally {
      if (previous === undefined) delete process.env.PROTOYARD_STORAGE_NAMESPACE;
      else process.env.PROTOYARD_STORAGE_NAMESPACE = previous;
    }
  });

  it('marks template demos as embedded so the marketplace can play them', () => {
    const registry = {
      entries: [entry('template', 'blank'), entry('blueprint', 'booking')],
    } as Registry;
    const result = showcaseRegistry(registry, [
      { kind: 'template', slug: 'blank', appPath: 't/blank/app/', ok: true, durationMs: 1 },
    ]);
    expect(
      result.entries.map((e) => (e as RegistryEntry & { embedded?: unknown }).embedded ?? null)
    ).toEqual([{ url: 't/blank/app/', scenarioLinks: true }, null]);
  });

  it('marks only successfully built entries as embedded', () => {
    const registry = {
      entries: [
        entry('prototype', 'crm-demo'),
        entry('prototype', 'broken'),
        entry('template', 'blank'),
      ],
    } as Registry;
    const result = showcaseRegistry(registry, [
      { kind: 'prototype', slug: 'crm-demo', appPath: 'p/crm-demo/app/', ok: true, durationMs: 1 },
      { kind: 'prototype', slug: 'broken', appPath: 'p/broken/app/', ok: false, durationMs: 1 },
    ]);
    const embedded = result.entries.map(
      (e) => (e as RegistryEntry & { embedded?: unknown }).embedded ?? null
    );
    expect(embedded).toEqual([{ url: 'p/crm-demo/app/', scenarioLinks: true }, null, null]);
    // The source registry object is not mutated.
    expect(
      (registry.entries[0] as RegistryEntry & { embedded?: unknown }).embedded
    ).toBeUndefined();
  });

  it('refuses to publish when any showcase target failed', () => {
    expect(() =>
      assertShowcasePublishable([
        { kind: 'prototype', slug: 'working', appPath: 'p/working/app/', ok: true, durationMs: 1 },
        {
          kind: 'prototype',
          slug: 'broken',
          appPath: 'p/broken/app/',
          ok: false,
          durationMs: 1,
          error: 'build failed',
        },
      ])
    ).toThrow(/1 of 2 showcase target\(s\) failed; refusing to publish/);
  });

  it('dry-runs one Cloudflare deployment without uploading the showcase marker', async () => {
    const ws = createWorkspace();
    try {
      const out = join(ws.root, 'artifacts/showcase');
      const markerContents = '{"generator":"@protoyard/cli"}\n';
      ws.write('artifacts/showcase/index.html', '<h1>Showcase</h1>');
      ws.write(`artifacts/showcase/${SHOWCASE_MARKER}`, markerContents);
      const provider: PublishProvider = {
        id: 'cloudflare',
        label: 'Cloudflare Pages',
        experimental: false,
        defaultProject: (slug) => `protoyard-${slug}`,
        validateProject: () => null,
        isAvailable: async () => ({ available: true }),
        isAuthenticated: async () => ({ authenticated: false, detail: 'not logged in' }),
        command: (input) => [
          'wrangler',
          'pages',
          'deploy',
          input.distDir,
          '--project-name',
          input.project,
          '--branch',
          input.branch ?? 'preview',
        ],
        publish: async () => {
          throw new Error('A dry run must not publish.');
        },
      };
      const ctx = {
        root: ws.root,
        yes: false,
        paths: { artifacts: join(ws.root, 'artifacts') },
      } as CommandContext;

      const result = await publishShowcaseDirectory(ctx, out, provider, {
        dryRun: true,
        project: 'protoyard-showcase',
        branch: 'team-review',
      });

      expect(result.kind).toBe('dry-run');
      expect(result).toMatchObject({
        slug: 'showcase',
        project: 'protoyard-showcase',
        branch: 'team-review',
        files: 1,
        dryRun: true,
      });
      expect(result.command).toEqual([
        'wrangler',
        'pages',
        'deploy',
        out,
        '--project-name',
        'protoyard-showcase',
        '--branch',
        'team-review',
      ]);
      expect(readFileSync(join(out, SHOWCASE_MARKER), 'utf8')).toBe(markerContents);
    } finally {
      ws.cleanup();
    }
  });
});
