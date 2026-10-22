import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Bundle guard for the rich views kit. A real Vite build of a fixture app
 * (tests/fixtures/views-prototype) with one entry per view, each on top of a
 * realistic shell (renderer services and live queries, the ui Button and
 * toasts), linked to the real packages the way pnpm links them into a
 * prototype (so `exports` and `sideEffects` apply). It fails when a view pulls
 * Bits UI's menu, popover or dialog layers into the first screen (they load on
 * first use, see packages/views-ui/src/lib/lazy-overlays.svelte.ts), when
 * unused siblings are bundled, or when a view grows past its ceiling.
 *
 * Run alone: `pnpm vitest run packages/cli/tests/views-bundle.test.ts`
 * (PROTOYARD_BUNDLE_DEBUG=1 prints each view's modules by origin).
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(ROOT, 'tests/fixtures/views-prototype');
const VIEWS = ['board', 'calendar', 'grid', 'map', 'editor', 'timeline'] as const;
type View = (typeof VIEWS)[number];

/**
 * What each view adds to the first screen over the shell, in gzip bytes (level
 * 9), about 7 % above the values measured on 2026-10-20 with one build per
 * view (board 11,966, calendar 16,106, grid 19,142, map 11,573, editor 6,452,
 * timeline 8,458); see docs/PERFORMANCE.md → Views kit. Lower them when the
 * kit shrinks. The grid was re-measured on 2026-10-21 at 21,859 after facets,
 * filter chips, saved-view changes and row selection joined it (19,300 before;
 * the optional parts load lazily), so its ceiling is 21,859 + 7 %. The editor
 * was re-measured on 2026-10-21 at 7,090 after slash commands and the safe link
 * menu joined it (6,452 before), so its ceiling is 7,090 + 7 %.
 */
export const CEILINGS: Record<View, number> = {
  board: 12_800,
  calendar: 17_200,
  grid: 23_400,
  map: 12_400,
  editor: 7_600,
  timeline: 9_100,
};

let dir = '';
/** One build per entry (the shell alone, or the shell plus one view): chunk boundaries never depend on the other views. */
const builds = new Map<string, { chunks: Rollup.OutputChunk[]; assets: Rollup.OutputAsset[] }>();

const gzip = (code: string) => gzipSync(code, { level: 9 }).length;
const posix = (id: string) => id.replaceAll('\\', '/');

/** The entry chunk plus everything it imports statically: what the first screen downloads. */
function initialChunks(entryName: string): Rollup.OutputChunk[] {
  const output = builds.get(entryName)?.chunks ?? [];
  const byFile = new Map(output.map((c) => [c.fileName, c]));
  const entry = output.find((c) => c.isEntry);
  if (!entry) throw new Error(`no entry ${entryName}`);
  const seen = new Set<string>();
  const queue = [entry.fileName];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of byFile.get(file)?.imports ?? []) queue.push(next);
  }
  return [...seen].map((f) => byFile.get(f) as Rollup.OutputChunk);
}
const size = (chunks: readonly Rollup.OutputChunk[]) =>
  chunks.reduce((n, c) => n + gzip(c.code), 0);
const modulesOf = (chunks: readonly Rollup.OutputChunk[]) =>
  chunks.flatMap((c) => c.moduleIds).map(posix);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'protoyard-views-bundle-'));
  await cp(FIXTURE, dir, { recursive: true });
  await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
  for (const name of ['views-ui', 'ui', 'renderer-svelte']) {
    await symlink(join(ROOT, 'packages', name), join(dir, 'node_modules/@protoyard', name), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  // Vitest runs with NODE_ENV=test; prototypes ship production builds.
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const entry of ['shell', ...VIEWS, 'activity']) {
      const result = await build({
        mode: 'production',
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [svelte()],
        build: {
          outDir: join(dir, 'dist', entry),
          emptyOutDir: true,
          rollupOptions: { input: { [entry]: join(dir, `${entry}.html`) } },
        },
      });
      const all = ((Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[]).flatMap(
        (o) => o.output
      );
      builds.set(entry, {
        chunks: all.filter((o): o is Rollup.OutputChunk => o.type === 'chunk'),
        assets: all.filter((o): o is Rollup.OutputAsset => o.type === 'asset'),
      });
    }
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
}, 600_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('views kit bundle guard (real Vite build)', () => {
  it('keeps Bits UI menus, popovers and dialogs out of every view’s first screen', () => {
    for (const view of [...VIEWS, 'activity']) {
      const initial = modulesOf(initialChunks(view));
      const leaked = initial.filter((id) =>
        /\/bits-ui\/dist\/bits\/(menu|dropdown-menu|popover|dialog|alert-dialog|select)\//.test(id)
      );
      expect(leaked, `${view} first screen`).toEqual([]);
    }
    // …and each overlay still ships, in its own lazy chunk.
    const lazyOf = (view: string) =>
      (builds.get(view)?.chunks ?? [])
        .filter((c) => c.isDynamicEntry)
        .map((c) => posix(c.facadeModuleId ?? ''));
    const lazy = [...lazyOf('board'), ...lazyOf('calendar'), ...lazyOf('grid')];
    for (const overlay of ['menu', 'popover', 'dialog']) {
      expect(
        lazy.some((id) => id.endsWith(`/views-ui/src/lib/overlays/${overlay}.ts`)),
        overlay
      ).toBe(true);
    }
  });

  it('drops unused sibling components of a subpath, and keeps used components’ CSS', () => {
    const activity = modulesOf(initialChunks('activity'));
    expect(activity.some((id) => id.endsWith('/activity/CommentThread.svelte'))).toBe(true);
    expect(activity.some((id) => id.endsWith('/activity/ActivityFeed.svelte'))).toBe(false);
    // TimelineView's own <style> block is emitted with sideEffects ["**/*.css"].
    expect(
      (builds.get('timeline')?.assets ?? []).some(
        (a) => a.fileName.endsWith('.css') && String(a.source).includes('.task-bar')
      )
    ).toBe(true);
  });

  it('stays under each view’s ceiling over the shell', () => {
    const shell = size(initialChunks('shell'));
    const shellModules = new Set(modulesOf(initialChunks('shell')));
    const measured: Record<string, number> = {};
    for (const view of VIEWS) {
      const chunks = initialChunks(view);
      measured[view] = size(chunks) - shell;
      if (process.env.PROTOYARD_BUNDLE_DEBUG) {
        const by: Record<string, number> = {};
        for (const c of chunks) {
          for (const [id, m] of Object.entries(c.modules)) {
            const p = posix(id);
            if (shellModules.has(p)) continue;
            const key =
              p
                .match(/packages\/([^/]+)\/src\/([^/]+)/)
                ?.slice(1)
                .join('/') ??
              p.match(/node_modules\/(?:\.pnpm\/)?((?:@[^/+]+[/+])?[^/@]+)/)?.[1] ??
              p;
            by[key] = (by[key] ?? 0) + m.renderedLength;
          }
        }
        console.info(`${view} rendered bytes by origin`, JSON.stringify(by));
      }
    }
    console.info(`views bundle guard (gzip -9 over the shell): ${JSON.stringify(measured)}`);
    for (const view of VIEWS) {
      expect(measured[view], view).toBeLessThanOrEqual(CEILINGS[view]);
    }
  });
});
