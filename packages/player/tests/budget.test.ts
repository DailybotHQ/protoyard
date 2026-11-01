// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseBudgetConfig, resolveKindBudget } from '../../cli/src/lib/budgets.ts';
import { classifyChunks, type ViteManifest } from '../../cli/src/lib/bundle-analysis.ts';
import { WORKER_GRAPH_GZIP_KB } from './player-budgets.ts';

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

/** The manifest as one HTML page sees it: that page is the only entry. */
export function asEntry(manifest: ViteManifest, page: string): ViteManifest {
  return Object.fromEntries(
    Object.entries(manifest).map(([key, chunk]) => [key, { ...chunk, isEntry: key === page }])
  );
}

/** Every stylesheet a page can ever load: its chunks, static and dynamic, transitively. */
export function reachableCss(manifest: ViteManifest, page: string): string[] {
  const seen = new Set<string>();
  const css = new Set<string>();
  const queue = [page];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    const chunk = manifest[key];
    if (seen.has(key) || !chunk) continue;
    seen.add(key);
    if (/\.css$/.test(chunk.file)) css.add(chunk.file);
    for (const file of chunk.css ?? []) css.add(file);
    queue.push(...(chunk.imports ?? []), ...(chunk.dynamicImports ?? []));
  }
  return [...css].sort();
}

/** Every manifest key a page can ever load: static and dynamic imports, transitively. */
export function reachableKeys(manifest: ViteManifest, page: string): Set<string> {
  const seen = new Set<string>();
  const queue = [page];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    queue.push(...(manifest[key].imports ?? []), ...(manifest[key].dynamicImports ?? []));
  }
  return seen;
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

/**
 * Ceilings on every stylesheet a player page can ever load, gzip KB. The
 * existing 0.4.0 ceilings are already tighter than Texuli 0.5.0 measurements
 * + 5 %, so keep them rather than raising them: index.html 134.454 KB (old
 * 129.7; cap 136.2), deck.html 107.663 KB (old 105.6; cap 110.9), page.html
 * and doc.html 108.956 KB (old 106.9; cap 112.3). The 0.5.0 initial CSS is
 * 15,330 B for index, 15,644 B for deck and 16,968 B for page/doc. Initial-CSS
 * caps are tightened in protoyard.budgets.json to measured + 5% (rounded up).
 * Texuli 0.8.0 (PLAN_008: motion tokens and focus/forced-colors CSS): deck.html 111.27 KB and page.html/doc.html
 * 112.57 KB; raised to measured + 1 %.
 */
// Texuli 0.9.0 measured index 142.85, deck 117.02, page and doc 118.30 KB
// (token contract v2 component CSS plus @texuli/tokens/base.css, gap G110); + 2.5 %.
// index.html reaches every kind and kit by design; PLAN_008 wave 2 adds pages-ui
// (5.2 KB), forms (2.2 KB, gap G119), the sheets view (1.7 KB) and @texuli/player
// CSS reachable only through the editor embed path (5.5 KB, gap G123): measured
// 149.9 KB; + 2.5 %. Each kind page is under its 0.9.0 cap (deck 114.0, page
// 69.2, doc 101.5 KB) since kind pages load only their own renderer.
// PLAN_008 T-remeasure (2026-10-31): deck 113.99, page 69.23, doc 101.47 KB,
// so the kind caps are lowered to measured + 5 % (were 120.0 / 121.3 / 121.3).
// index.html measured 151.88 KB stays under its 153.7 KB cap.
// Texuli 0.10.0 (PLAN_008, 2026-10-31): system.css instead of base.css (G110), the
// deck print view on export-core (G105) and the doc editor on editor-core (G123):
// all CSS deck 114.80 -> 84.44 KB, page 69.98 -> 68.84 KB, doc 103.03 -> 72.68 KB;
// initial CSS 1.0–1.1 KB lower on every page. The T-remeasure caps above still hold.
const PLAYER_TOTAL_CSS_GZIP_KB = { index: 153.7, deck: 119.7, page: 72.7, doc: 106.6 } as const;

const built = existsSync(MANIFEST);

describe.skipIf(!built)(
  'player bundle budget (after pnpm --filter @protoyard/player build)',
  () => {
    const full = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
    // The app path is index.html; deck.html, page.html and doc.html are measured below.
    const manifest = asEntry(full, 'index.html');
    const classes = classifyChunks(manifest);
    const budgets = parseBudgetConfig(
      JSON.parse(readFileSync(join(REPO, 'protoyard.budgets.json'), 'utf8'))
    );
    const budget = { ...budgets.defaults, ...(budgets.overrides.player ?? {}) };

    it('keeps initial JS inside the initial JS budget', () => {
      expect(classes.initialJs.length).toBeGreaterThan(0);
      const kb = sum(classes.initialJs) / KB;
      expect(kb, `initial JS ${kb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(budget.initialJsGzipKb);
    });

    it('keeps initial CSS inside the CSS budget (and reports all CSS)', () => {
      expect(classes.initialCss.length).toBeGreaterThan(0);
      const initialKb = sum(classes.initialCss) / KB;
      expect(initialKb, `initial CSS ${initialKb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
        budget.cssGzipKb
      );
      // Decision (FIX-texuli-css-split, 2026-10-24): for the player, cssGzipKb
      // is the INITIAL CSS of each entry. Every stylesheet index.html can ever
      // load (all kinds and kits, split by Rolldown) has its own ceiling at the
      // measured total + 5 % (PLAYER_TOTAL_CSS_GZIP_KB), so it cannot grow silently.
      const allKb = sum(reachableCss(manifest, 'index.html')) / KB;
      expect(allKb, `all CSS ${allKb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
        PLAYER_TOTAL_CSS_GZIP_KB.index
      );
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

// --- merged from kind-budget.test.ts ---

describe('kind-budget', () => {
  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  const DIST = process.env.PLAYER_DIST ?? join(REPO, 'packages', 'player', 'dist', 'app');
  const MANIFEST = join(DIST, '.vite', 'manifest.json');
  const KB = 1024;

  const ENTRIES = [
    { page: 'index.html', kind: 'app' },
    { page: 'deck.html', kind: 'deck' },
    { page: 'page.html', kind: 'page' },
    { page: 'doc.html', kind: 'doc' },
  ] as const;

  const CONTENT_KIND_ONLY_MODULES: [string, RegExp][] = [
    ['Faker', /@faker-js\/faker|\/faker\/src\//],
    ['world-generation worker', /generate-world|\/worker\//],
    ['CRUD screens or app shell', /\/crud\/src\/(?:screens|app)\//],
    ['DevTools', /\/devtools\/src\//],
  ];

  function entryManifest(manifest: ViteManifest, page: string): ViteManifest {
    return Object.fromEntries(
      Object.entries(manifest).map(([key, chunk]) => [key, { ...chunk, isEntry: key === page }])
    );
  }

  /** Follows only static imports: these are the chunks downloaded before the entry runs. */
  function staticKeys(manifest: ViteManifest, page: string): Set<string> {
    const seen = new Set<string>();
    const queue = [page];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      if (seen.has(key) || !manifest[key]) continue;
      seen.add(key);
      queue.push(...(manifest[key].imports ?? []));
    }
    return seen;
  }

  function gzipBytes(files: readonly string[]): number {
    return files.reduce(
      (total, file) => total + gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length,
      0
    );
  }

  const built = existsSync(MANIFEST);

  describe.skipIf(!built)('player entry bundle budgets (build the player first)', () => {
    const manifest = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
    const config = parseBudgetConfig(
      JSON.parse(readFileSync(join(REPO, 'protoyard.budgets.json'), 'utf8'))
    );
    const defaultBudget = { ...config.defaults, ...(config.overrides.player ?? {}) };
    const measurements: Record<string, { jsBytes: number; cssBytes: number }> = {};

    it('every player entry stays within its configured initial JS and CSS limits', () => {
      for (const { page, kind } of ENTRIES) {
        expect(manifest[page]?.isEntry, `${page} is present in the build manifest`).toBe(true);
        const scoped = entryManifest(manifest, page);
        const chunks = classifyChunks(scoped);
        const jsBytes = gzipBytes(chunks.initialJs);
        const cssBytes = gzipBytes(chunks.initialCss);
        const jsBudgetKb =
          kind === 'app'
            ? defaultBudget.initialJsGzipKb
            : resolveKindBudget(config, kind).initialJsGzipKb;
        const cssBudgetKb =
          kind === 'app' ? defaultBudget.cssGzipKb : resolveKindBudget(config, kind).cssGzipKb;
        const diagnostics = `${page}: initial JS ${jsBytes.toLocaleString()} B (${(jsBytes / KB).toFixed(2)} KB gzip; limit ${jsBudgetKb} KB), initial CSS ${cssBytes.toLocaleString()} B (${(cssBytes / KB).toFixed(2)} KB gzip; limit ${cssBudgetKb} KB)`;
        measurements[page] = { jsBytes, cssBytes };

        expect(
          chunks.initialJs.length,
          `${diagnostics}; at least one initial JS chunk`
        ).toBeGreaterThan(0);
        expect(
          chunks.initialCss.length,
          `${diagnostics}; at least one initial CSS chunk`
        ).toBeGreaterThan(0);
        expect(jsBytes, diagnostics).toBeLessThanOrEqual(jsBudgetKb * KB);
        expect(cssBytes, diagnostics).toBeLessThanOrEqual(cssBudgetKb * KB);
      }
    });

    it('every content-kind entry keeps app-only dependencies outside its initial graph', () => {
      for (const { page } of ENTRIES.filter(({ kind }) => kind !== 'app')) {
        const keys = staticKeys(manifest, page);
        const modules = [...keys].map((key) => `${key} ${manifest[key]?.src ?? ''}`);
        for (const [label, pattern] of CONTENT_KIND_ONLY_MODULES) {
          const matches = modules.filter((module) => pattern.test(module));
          expect(matches, `${page} initial dependency graph excludes ${label}`).toEqual([]);
        }
      }
    });
  });
});
