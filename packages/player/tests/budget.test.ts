// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseBudgetConfig } from '../../cli/src/lib/budgets.ts';
import { classifyChunks, type ViteManifest } from '../../cli/src/lib/bundle-analysis.ts';

/**
 * The player's bundle budget, from its real Vite build (`pnpm --filter
 * @protoyard/player build` first; without dist/app/ this suite is skipped and
 * says so). Initial JS and CSS stay inside protoyard.budgets.json, and the
 * heavy kits (Faker, DevTools, the theme library, crud screens and app,
 * charts, analytics and views kits, the world-generation worker) are proven
 * absent from the initial graph, both by the manifest and by content.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
// PLAYER_DIST points the checks at another build (e.g. a saved one, for comparisons).
const DIST = process.env.PLAYER_DIST ?? join(REPO, 'packages', 'player', 'dist', 'app');
const MANIFEST = join(DIST, '.vite', 'manifest.json');
const KB = 1024;

/**
 * The worker's whole import graph (entry + generator + scenarios + English
 * Faker), gzip. Measured 195.5 KB after building workers as ES modules (it
 * was 921 KB with every Faker locale). Proposed as a protoyard.budgets.json
 * key; until the lead adds one, it lives here.
 */
const WORKER_GRAPH_GZIP_KB = 220;

const gzip = (file: string) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
const sum = (files: readonly string[]) => files.reduce((total, file) => total + gzip(file), 0);

/** Manifest keys reached from the entries through static imports. */
export function initialKeys(manifest: ViteManifest): Set<string> {
  const keys = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (keys.has(key) || !manifest[key]) continue;
    keys.add(key);
    queue.push(...(manifest[key].imports ?? []));
  }
  return keys;
}

/** Relative module imports in an emitted chunk (static, dynamic, template literal). */
export function chunkImports(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"`]\.\/([^'"`]+\.js)['"`]/g)].map(
    (m) => m[1] ?? ''
  );
}

/** A chunk and every chunk it imports, statically or dynamically. */
function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(join(DIST, 'assets', file))) return;
    seen.add(file);
    for (const next of chunkImports(readFileSync(join(DIST, 'assets', file), 'utf8'))) visit(next);
  };
  visit(entry);
  return [...seen].map((file) => `assets/${file}`);
}

/** Modules that must only ever load on demand, by manifest key. */
const LAZY_MODULES: [string, RegExp][] = [
  ['Faker', /@faker-js\/faker/],
  ['DevTools', /\/devtools\/src\//],
  ['theme library', /\/themes\/src\/library\//],
  ['crud screen kits', /\/crud\/src\/screens\//],
  ['crud app shell', /\/crud\/src\/app\//],
  ['charts', /\/charts-ui\/src\//],
  ['analytics kit', /\/analytics-ui\/src\//],
  ['views kit', /\/views-ui\/src\//],
  ['blueprint world generator', /\/blueprint\/src\/generator/],
  ['main-thread generation fallback', /\/worker\/generate-world-core/],
];

describe('chunk helpers', () => {
  it('walks static imports only, and finds every import form in emitted code', () => {
    const manifest: ViteManifest = {
      'index.html': {
        file: 'assets/index.js',
        isEntry: true,
        imports: ['_a.js'],
        dynamicImports: ['lazy.ts'],
      },
      '_a.js': { file: 'assets/a.js', imports: ['_b.js'] },
      '_b.js': { file: 'assets/b.js' },
      'lazy.ts': { file: 'assets/lazy.js', isDynamicEntry: true },
    };
    expect([...initialKeys(manifest)].sort()).toEqual(['_a.js', '_b.js', 'index.html']);
    expect(
      chunkImports(
        'import{a}from"./a.js";export*from\'./b.js\';await import(`./c.js`);import("./d.js");import x from "svelte";'
      )
    ).toEqual(['a.js', 'b.js', 'c.js', 'd.js']);
  });
});

const built = existsSync(MANIFEST);

describe.skipIf(!built)(
  'player bundle budget (after pnpm --filter @protoyard/player build)',
  () => {
    const manifest = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
    const classes = classifyChunks(manifest);
    const initial = initialKeys(manifest);
    const budgets = parseBudgetConfig(
      JSON.parse(readFileSync(join(REPO, 'protoyard.budgets.json'), 'utf8'))
    );
    const budget = { ...budgets.defaults, ...(budgets.overrides.player ?? {}) };

    it('keeps initial JS inside the initial JS budget', () => {
      expect(classes.initialJs.length).toBeGreaterThan(0);
      const kb = sum(classes.initialJs) / KB;
      expect(kb, `initial JS ${kb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(budget.initialJsGzipKb);
    });

    it('keeps app initial JS near the pre-kinds baseline after lazy body loading', () => {
      const bytes = sum(classes.initialJs);
      expect(bytes, `initial JS ${bytes.toLocaleString()} B gzip`).toBeLessThanOrEqual(196_000);
    });

    it('keeps initial CSS inside the CSS budget (and reports all CSS)', () => {
      expect(classes.initialCss.length).toBeGreaterThan(0);
      const initialKb = sum(classes.initialCss) / KB;
      expect(initialKb, `initial CSS ${initialKb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
        budget.cssGzipKb
      );
      // The CLI budget counts every stylesheet; the player stays inside that too.
      const allKb = sum([...classes.initialCss, ...classes.lazyCss]) / KB;
      expect(allKb, `all CSS ${allKb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(budget.cssGzipKb);
    });

    it.each(LAZY_MODULES)('keeps the %s out of the initial graph', (_label, pattern) => {
      const keys = Object.keys(manifest).filter((key) => pattern.test(key));
      expect(keys.length, `no ${pattern} module in the build`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(initial.has(key), key).toBe(false);
        expect(classes.initialJs, key).not.toContain(manifest[key]?.file);
      }
    });

    it('keeps the content-kind body schemas off the app path (lazy or not bundled at all)', () => {
      // An app blueprint never pays for decks, pages or docs: their body schemas
      // load through `kindBodySchema(kind)` only for content kinds. Until the
      // player routes kinds they may be absent from the build; never initial.
      const kinds = Object.keys(manifest).filter((key) =>
        /\/blueprint\/src\/kinds\/(deck|page|doc)\.ts$|\/(decks|pages)\/src\//.test(key)
      );
      for (const key of kinds) expect(initial.has(key), key).toBe(false);
      const initialCode = classes.initialJs
        .map((file) => readFileSync(join(DIST, file), 'utf8'))
        .join('\n');
      // Literal messages unique to each schema (they survive minification).
      expect(initialCode.includes('block ids must be unique'), 'the page body schema').toBe(false);
      expect(initialCode.includes('lists headings of level 2'), 'the doc body schema').toBe(false);
      expect(
        initialCode.includes('Opening cover: title, subtitle'),
        'the deck layout catalog'
      ).toBe(false);
      expect(initialCode.includes('A step marker may set fragment'), 'the deck schema').toBe(false);
    });

    it('keeps the app path initial JS at its measured size (regression cap)', () => {
      // Measured 2026-10-22 (gzip -9, static closure of index.html): 188,442 B
      // before PLAN_005; 228,317 B on dev once content-kind schemas, the brief
      // synthesizer and deck lint rode in through the blueprint barrel; 116.2 KB
      // after sources/start.ts imported only `parseBlueprint`; 120.0 KB with
      // routing by kind (the kind-aware loader and the router) once Dexie and
      // Rolldown's runtime got their own chunks (vite.config.ts). See
      // docs/PERFORMANCE.md. The cap leaves about 4 %: growth must say why here.
      expect(sum(classes.initialJs) / KB).toBeLessThanOrEqual(125);
    });

    it('ships no Faker data or worker reference in initial JS', () => {
      const initialCode = classes.initialJs
        .map((file) => readFileSync(join(DIST, file), 'utf8'))
        .join('\n');
      // Booleans, so a failure names the marker instead of printing the chunk.
      expect(initialCode.includes('Aaliyah'), "Faker's English first names").toBe(false);
      expect(/generate\.worker-[\w-]+\.js/.test(initialCode), 'the worker file').toBe(false);
    });

    it('builds the world-generation worker as a lazy, English-only module graph inside its budget', () => {
      const worker = readdirSync(join(DIST, 'assets')).find((name) =>
        /^generate\.worker-.*\.js$/.test(name)
      );
      expect(worker, 'a generate.worker chunk').toBeDefined();
      const graph = importGraph(worker ?? '');
      for (const file of graph) expect(classes.initialJs, file).not.toContain(file);
      const code = graph.map((file) => readFileSync(join(DIST, file), 'utf8')).join('\n');
      expect(code.includes('Aaliyah'), 'English Faker data').toBe(true);
      // Other locales' data never ships (German streets, Japanese cities).
      expect(code.includes('Straße'), 'German Faker data').toBe(false);
      expect(code.includes('東京'), 'Japanese Faker data').toBe(false);
      const kb = sum(graph) / KB;
      expect(kb, `worker graph ${kb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(WORKER_GRAPH_GZIP_KB);
      expect(basename(graph[0] ?? '')).toBe(worker);
      // Split, not inlined. The worker is its own Rollup build, so these chunks are
      // separate copies from the app's (Faker ships twice until the runtime stops
      // loading it on the main thread for worker-generated definitions).
      expect(graph.length).toBeGreaterThan(1);
    });
  }
);
