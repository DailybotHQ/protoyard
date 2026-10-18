// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appPathFor,
  assertShowcasePublishable,
  publishShowcaseDirectory,
  showcaseRegistry,
} from '../src/commands/showcase.ts';
import { SHOWCASE_MARKER } from '../src/lib/output-guard.ts';
import type { Registry, RegistryEntry } from '../src/lib/registry.ts';
import type { CommandContext } from '../src/lib/workspace.ts';
import type { PublishProvider } from '../src/publish/types.ts';
import { createWorkspace } from './helpers.ts';

const entry = (kind: RegistryEntry['kind'], slug: string) => ({ kind, slug }) as RegistryEntry;

describe('showcase', () => {
  it('places apps under their gallery detail pages', () => {
    expect(appPathFor(entry('prototype', 'crm-demo'))).toBe('p/crm-demo/app/');
    expect(appPathFor(entry('template', 'blank'))).toBe('t/blank/app/');
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
