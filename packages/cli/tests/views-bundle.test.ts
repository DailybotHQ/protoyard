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
 * menu, popover or dialog layers into the first screen (they load on
 * first use via Texuli lazy menus/popovers/dialogs and views-ui lazy overlays), when
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
 * 9). Defaults stay from the pre-Texuli kit (about 7 % above 2026-10-20
 * measures); see docs/PERFORMANCE.md → Views kit. Lower them when the kit
 * shrinks. After the Texuli views adoption + cn→cx (texuli/cx) and QueryState
 * without `@protoyard/ui` cn, re-measured on 2026-10-24:
 * board 10,932, calendar 14,271, grid 17,362, map 5,827, editor 8,187,
 * timeline 10,067. On npm Texuli 0.4.0 (2026-10-28): board 13,900,
 * calendar 15,801, grid 19,297, map 8,073, editor 9,484, timeline 11,973.
 * On npm Texuli 0.5.0: board 14,137, calendar 15,847, grid 20,116, map
 * 8,066, editor 9,508, timeline 11,981. Where measured + 5 % is below the
 * prior ceiling, lower it; never raise a ceiling.
 *
 * Exception, PLAN_008 (2026-10-30): npm Texuli 0.8.0 grew the views over the
 * shell (board 16,471, calendar 16,940, grid 22,792, map 8,026, editor 9,669,
 * timeline 13,056). Board, calendar, grid and timeline are raised to measured
 * + 5 % while Texuli gap G86 (view size regression since 0.5.0) is open; lower
 * them again when it is fixed.
 */
export const CEILINGS: Record<View, number> = {
  board: 17_295,
  calendar: 17_787,
  grid: 23_932,
  map: 8_470,
  // Measured 9,484 gzip over shell on Texuli 0.4.0 (MarkdownEditor on Texuli Textarea); +5 %.
  editor: 9_958,
  // Measured 11,973 gzip over shell on Texuli 0.4.0 (TimelineView + QueryState/empty); +5 %.
  timeline: 13_709,
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
  await mkdir(join(dir, 'node_modules/@texuli'), { recursive: true });
  for (const name of ['views-ui', 'ui', 'renderer-svelte']) {
    await symlink(join(ROOT, 'packages', name), join(dir, 'node_modules/@protoyard', name), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  // views-ui class composition uses texuli/cx; Texuli data views resolve @texuli/*.
  await symlink(join(ROOT, 'node_modules/texuli'), join(dir, 'node_modules/texuli'), 'dir');
  await symlink(
    join(ROOT, 'node_modules/@texuli/data'),
    join(dir, 'node_modules/@texuli/data'),
    'dir'
  );
  await symlink(
    join(ROOT, 'node_modules/@texuli/core'),
    join(dir, 'node_modules/@texuli/core'),
    'dir'
  );
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
  it('keeps menus, popovers and dialogs out of every view’s first screen', () => {
    for (const view of [...VIEWS, 'activity']) {
      const initial = modulesOf(initialChunks(view));
      const leaked = initial.filter((id) =>
        /\/texuli\/packages\/(?:primitives\/src\/(?:menu|context-menu|popover|dialog|alert-dialog|select|sheet)|texuli\/src\/components\/(?:menus|popover|dialog|select|sheet))\//.test(
          id
        )
      );
      expect(leaked, `${view} first screen`).toEqual([]);
    }
    // …and Texuli menu / popover / dialog surfaces still ship as lazy chunks
    // (board Move menu, calendar Move menu, and any Texuli overlay modules).
    const lazyOf = (view: string) =>
      (builds.get(view)?.chunks ?? [])
        .filter((c) => c.isDynamicEntry)
        .map((c) => posix(c.facadeModuleId ?? ''));
    const lazy = [...lazyOf('board'), ...lazyOf('calendar'), ...lazyOf('grid')];
    const isTexuliOverlay = (id: string) =>
      /\/texuli\/packages\/(data|texuli|primitives)\/.*\/(BoardMoveMenu|CalendarMoveMenu|menu|Menu|popover|Popover|dialog|Dialog|alert-dialog|AlertDialog)/i.test(
        id
      ) ||
      /\/@texuli\/(data|primitives)\/.*\/(BoardMoveMenu|CalendarMoveMenu)/.test(id) ||
      /\/views-ui\/src\/lib\/overlays\/(menu|popover|dialog)\.ts$/.test(id);
    expect(
      lazy.some(isTexuliOverlay),
      `expected a lazy Texuli/views-ui overlay chunk, got: ${JSON.stringify(lazy)}`
    ).toBe(true);
    // Board and calendar Move menus must be dynamic entries (not on the first screen).
    expect(
      lazyOf('board').some((id) => id.includes('BoardMoveMenu')),
      'board Move menu lazy'
    ).toBe(true);
    expect(
      lazyOf('calendar').some((id) => id.includes('CalendarMoveMenu')),
      'calendar Move menu lazy'
    ).toBe(true);
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
