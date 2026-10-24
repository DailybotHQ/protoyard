import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  classifyChunks,
  VITE_MANIFEST_PATH,
  type ViteManifest,
} from '../src/lib/bundle-analysis.ts';

/*
 * Bundle guard for the charts kit. A real Vite build of a fixture app that
 * shows a Sparkline on its first screen and lazily imports LineChart and
 * BarChart, linked to the real packages the way pnpm links them into a
 * prototype (so package `exports` and `sideEffects` apply). It fails when
 * chart code leaks into initial JS, when unused siblings are bundled, or
 * when the chunks grow past their ceilings.
 *
 * A Vite build takes a few seconds (longer on a busy machine), hence the
 * long timeout. Run alone: `pnpm vitest run packages/cli/tests/charts-bundle.test.ts`.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(ROOT, 'tests/fixtures/charts-prototype');

/**
 * Ceilings in gzip bytes (level 9). Measured after Texuli charts-ui re-export
 * (sparkline initial delta ~3,211 B). ~7 % headroom; lower when the kit shrinks.
 */
export const CEILINGS = {
  /** What Sparkline adds to the first screen's JS, over the same app without charts. */
  sparklineInitialDelta: 3_450,
  /** LineChart + BarChart: what opening the charts view downloads (table and Canvas excluded, they load later). */
  lineBarLazy: 17_000,
};

let dir = '';
let output: Rollup.OutputChunk[] = [];
let assets: Rollup.OutputAsset[] = [];
let manifest: ViteManifest = {};

const gzip = (code: string | Uint8Array) => gzipSync(code, { level: 9 }).length;

/** A chunk plus everything it imports statically (what loading it downloads). */
function closure(start: Rollup.OutputChunk): Rollup.OutputChunk[] {
  const byFile = new Map(output.map((c) => [c.fileName, c]));
  const entry = start;
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

/** Entry chunk plus everything it imports statically. */
function initialChunks(entryName: string): Rollup.OutputChunk[] {
  const entry = output.find((c) => c.isEntry && c.name === entryName);
  if (!entry) throw new Error(`no entry ${entryName}`);
  return closure(entry);
}

const modulesOf = (chunks: readonly Rollup.OutputChunk[]) => chunks.flatMap((c) => c.moduleIds);
const posix = (id: string) => id.replaceAll('\\', '/');

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'protoyard-charts-bundle-'));
  await cp(FIXTURE, dir, { recursive: true });
  // Link the real packages like pnpm does, so Vite reads their package.json (exports, sideEffects).
  await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
  await symlink(
    join(ROOT, 'packages/charts-ui'),
    join(dir, 'node_modules/@protoyard/charts-ui'),
    'dir'
  );
  await symlink(join(ROOT, 'packages/charts'), join(dir, 'node_modules/@protoyard/charts'), 'dir');
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  // Vitest runs with NODE_ENV=test, which would build Svelte's development runtime; prototypes ship production builds.
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const result = await build({
    mode: 'production',
    root: dir,
    configFile: false,
    logLevel: 'silent',
    plugins: [svelte()],
    build: {
      outDir: join(dir, 'dist'),
      emptyOutDir: true,
      manifest: VITE_MANIFEST_PATH,
      rollupOptions: {
        input: { app: join(dir, 'index.html'), baseline: join(dir, 'baseline.html') },
      },
    },
  });
  process.env.NODE_ENV = previousEnv;
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const all = outputs.flatMap((o) => o.output);
  output = all.filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
  assets = all.filter((o): o is Rollup.OutputAsset => o.type === 'asset');
  manifest = JSON.parse(
    await readFile(join(dir, 'dist', VITE_MANIFEST_PATH), 'utf8')
  ) as ViteManifest;
}, 240_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('charts bundle guard (real Vite build)', () => {
  it('keeps cartesian chart code out of initial JS', () => {
    const initial = modulesOf(initialChunks('app')).map(posix);
    expect(initial.some((id) => id.includes('/charts-ui/src/compact/Sparkline.svelte'))).toBe(true);
    expect(initial.filter((id) => id.includes('/charts-ui/src/cartesian/'))).toEqual([]);
    expect(initial.filter((id) => id.includes('/charts-ui/src/interaction/'))).toEqual([]);
    expect(initial.filter((id) => id.includes('/charts-ui/src/frame/'))).toEqual([]);
    // The CLI's manifest classification (what `protoyard budget` uses) agrees.
    const classified = classifyChunks(manifest);
    const lazyFiles = new Set(classified.lazyJs);
    const lineChunk = output.find((c) =>
      c.moduleIds.some((id) => posix(id).includes('/cartesian/LineChart.svelte'))
    );
    expect(lineChunk && lazyFiles.has(lineChunk.fileName)).toBe(true);
  });

  it('drops unused sibling components of a family subpath (sideEffects lists only CSS)', () => {
    const everything = modulesOf(output).map(posix);
    expect(everything.some((id) => id.includes('/compact/Gauge.svelte'))).toBe(false);
    expect(everything.some((id) => id.includes('/compact/RadialProgress.svelte'))).toBe(false);
    // Used Sparkline (or its Texuli compact CSS) still emits a stylesheet chunk.
    expect(assets.some((a) => a.fileName.endsWith('.css') && String(a.source).length > 0)).toBe(
      true
    );
  });

  it('stays under the size ceilings', () => {
    const size = (chunks: readonly Rollup.OutputChunk[]) =>
      chunks.reduce((n, c) => n + gzip(c.code), 0);
    const delta = size(initialChunks('app')) - size(initialChunks('baseline'));
    // Opening the charts view downloads the Charts.svelte chunk and its static imports, minus what the
    // first screen already has; the table, Canvas and the palette fallback load later, only if needed.
    const initialFiles = new Set(initialChunks('app').map((c) => c.fileName));
    const view = output.find(
      (c) => c.isDynamicEntry && posix(c.facadeModuleId ?? '').endsWith('/src/Charts.svelte')
    );
    if (!view) throw new Error('no Charts.svelte chunk');
    const viewChunks = closure(view).filter((c) => !initialFiles.has(c.fileName));
    const lazy = size(viewChunks);
    if (process.env.PROTOYARD_BUNDLE_DEBUG) {
      // Uncompressed rendered length by origin, to see how much is the Svelte runtime.
      const by: Record<string, number> = {};
      for (const c of viewChunks) {
        for (const [id, m] of Object.entries(c.modules)) {
          const key = posix(id).includes('/node_modules/svelte/')
            ? 'svelte runtime'
            : posix(id).includes('/packages/charts/')
              ? 'charts'
              : posix(id).includes('/charts-ui/')
                ? 'charts-ui'
                : 'other';
          by[key] = (by[key] ?? 0) + m.renderedLength;
        }
      }
      console.info('rendered bytes by origin', JSON.stringify(by));
      for (const c of viewChunks) {
        const mods = c.moduleIds
          .map((m) => posix(m).replace(/^.*\/(packages|node_modules)\//, ''))
          .join(' ');
        console.info(`${c.fileName} ${gzip(c.code)} B: ${mods}`);
      }
    }
    console.info(
      `charts bundle guard: Sparkline initial delta ${delta} B, line+bar view ${lazy} B (gzip -9)`
    );
    expect(delta).toBeLessThanOrEqual(CEILINGS.sparklineInitialDelta);
    expect(lazy).toBeLessThanOrEqual(CEILINGS.lineBarLazy);
  });
});
