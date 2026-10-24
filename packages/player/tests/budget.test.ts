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

/** Modules that must only ever load on demand, by manifest key. */
const LAZY_MODULES: [string, RegExp][] = [
  ['Faker', /@faker-js\/faker/],
  ['DevTools', /\/devtools\/src\//],
  // Library tokens come from @texuli/tokens, loaded on demand (the catalog metadata is eager):
  // the port's definitions, builder and chart modules, and the opt-in expansion.
  ['theme library', /\/tokens\/src\/library-(?:port|expand)\//],
  ['crud screen kits', /\/crud\/src\/screens\//],
  ['crud app shell', /\/crud\/src\/app\//],
  ['charts', /\/charts-ui\/src\//],
  ['analytics kit', /\/analytics-ui\/src\//],
  // Rich views come from Texuli's data views (linked or installed); their lazy
  // view and menu modules are the manifest keys (views-ui only adapts them).
  ['views kit', /[\\/](?:texuli[\\/]packages[\\/]data|node_modules[\\/]@texuli[\\/]data)[\\/]/],
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
    const full = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
    // The app path is index.html; deck.html, page.html and doc.html are measured below.
    const manifest = asEntry(full, 'index.html');
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
      // The CLI budget counts every stylesheet; the player stays inside that too
      // (every stylesheet index.html can load; the kind pages have their own).
      const allKb = sum(reachableCss(manifest, 'index.html')) / KB;
      expect(allKb, `all CSS ${allKb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(budget.cssGzipKb);
    });

    it('keeps the shared kind utility sheet out of initial CSS and on the kind boot path', () => {
      const bootFile = manifest['src/boot-kind.ts']?.file;
      expect(bootFile, 'the shared kind boot').toBeDefined();
      const bootCode = readFileSync(join(DIST, bootFile ?? ''), 'utf8');
      for (const key of ['src/kinds/content.css']) {
        const style = manifest[key]?.file;
        expect(style, `${key} is a built stylesheet`).toMatch(/\.css$/);
        if (!style) continue;
        expect(classes.initialCss, `${key} is not in initial CSS`).not.toContain(style);
        expect(bootCode, `${key} is requested by the lazy kind renderer`).toContain(
          basename(style)
        );
      }
    });

    it.each(['index', 'deck', 'page', 'doc'])(
      "%s.html never links a lazy Texuli module's stylesheet initially",
      (name) => {
        const initialCss = classifyChunks(asEntry(full, `${name}.html`)).initialCss;
        // Lazy Texuli modules (block, chart and data-view families, move menus)
        // are dynamic entries; their CSS loads with them, never up front.
        const lazy = Object.entries(full).filter(
          ([key, chunk]) =>
            chunk.isDynamicEntry === true &&
            /[\\/](?:texuli[\\/]packages|node_modules[\\/]@?texuli)[\\/]/.test(key)
        );
        expect(lazy.length, 'lazy Texuli modules in the build').toBeGreaterThan(0);
        const sheets = lazy.flatMap(([, chunk]) => chunk.css ?? []);
        expect(sheets.length, 'stylesheets of lazy Texuli modules').toBeGreaterThan(0);
        for (const file of sheets) expect(initialCss, file).not.toContain(file);
      }
    );

    it.each(LAZY_MODULES)('keeps the %s out of the initial graph', (_label, pattern) => {
      const keys = Object.keys(manifest).filter((key) => pattern.test(key));
      expect(
        keys.length,
        `no ${pattern} module in the build (stale? run pnpm --filter @protoyard/player build)`
      ).toBeGreaterThan(0);
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
      // Rolldown's runtime got their own chunks (vite.config.ts); 120.5 KB once
      // the per-kind pages share the player loop with index.html (run, start
      // and resolve became shared chunks, +0.4 KB of chunk overhead); 121.4 KB
      // once index.html's own entry carries the app-and-kind boot router
      // (boot-any.ts, +0.9 KB) so the shared loop no longer names the app boot.
      // See docs/PERFORMANCE.md. The cap leaves about 3 %: growth must say why here.
      // Measured after Texuli charts-ui link: ~127.4 KB gzip (was 125).
      expect(sum(classes.initialJs) / KB).toBeLessThanOrEqual(130);
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

/**
 * What a deck, page or doc page may never download, initially or later: the
 * app path. Matched on manifest keys (source paths), static and dynamic.
 */
const APP_ONLY_MODULES: [string, RegExp][] = [
  ['app boot', /(^|\/)src\/boot\.ts$/],
  ['crud app shell', /\/crud\/src\/app\//],
  ['crud screen kits', /\/crud\/src\/screens\//],
  ['main-thread generation fallback', /\/worker\/generate-world-core/],
  ['blueprint world generator', /\/blueprint\/src\/generator/],
  ['analytics kit', /\/analytics-ui\/src\//],
  ['SaaS kit', /\/saas(-ui)?\/src\//],
  ['AI kit', /\/ai-ui\/src\//],
  ['player archetype kits', /(^|\/)src\/archetypes\//],
];

describe.skipIf(!built)('the per-kind player pages (deck.html, page.html, doc.html)', () => {
  const full = built ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as ViteManifest) : {};
  const budgets = parseBudgetConfig(
    JSON.parse(readFileSync(join(REPO, 'protoyard.budgets.json'), 'utf8'))
  );
  const measured: Record<string, Record<string, number>> = {};
  const KINDS = ['deck', 'page', 'doc'] as const;

  it.each(APP_ONLY_MODULES)(
    'the %s pattern matches modules index.html can load',
    (_label, pattern) => {
      // Guards the absence checks below: a pattern that matched nothing anywhere
      // would make them pass vacuously.
      const reachable = reachableKeys(full, 'index.html');
      expect([...reachable].some((key) => pattern.test(key))).toBe(true);
    }
  );

  it('index.html can reach the worker file (so the kind pages check a real name)', () => {
    const code = [...reachableKeys(full, 'index.html')]
      .map((key) => full[key]?.file)
      .filter((file): file is string => typeof file === 'string' && file.endsWith('.js'))
      .map((file) => readFileSync(join(DIST, file), 'utf8'))
      .join('\n');
    expect(/generate\.worker-[\w-]+\.js/.test(code)).toBe(true);
  });

  it.each(KINDS)('%s.html stays inside its protoyard.budgets.json kind budget', (name) => {
    const page = `${name}.html`;
    expect(full[page]?.isEntry, `${page} is a build entry`).toBe(true);
    const budget = resolveKindBudget(budgets, name);
    const classes = classifyChunks(asEntry(full, page));
    const js = sum(classes.initialJs) / KB;
    const css = sum(classes.initialCss) / KB;
    const allCss = sum(reachableCss(full, page)) / KB;
    measured[name] = { initialJsKb: js, initialCssKb: css, allCssKb: allCss };
    expect(js, `${page} initial JS ${js.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
      budget.initialJsGzipKb
    );
    expect(css, `${page} initial CSS ${css.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
      budget.cssGzipKb
    );
    expect(allCss, `${page} all CSS ${allCss.toFixed(1)} KB gzip`).toBeLessThanOrEqual(
      budget.cssGzipKb
    );
  });

  it.each(KINDS)('%s.html keeps its measured initial JS (regression cap)', (name) => {
    // Measured 2026-10-22 (gzip -9): 121.6 KB (deck, page) and 121.5 KB (doc):
    // the shared source resolver and player loop plus about 1.2 KB of kind
    // entry glue; 18.1 to 18.3 KB initial CSS and 26.4 to 26.6 KB of CSS in
    // all. The kind boot and renderers stay lazy. The cap leaves about 3 %.
    const js = sum(classifyChunks(asEntry(full, `${name}.html`)).initialJs) / KB;
    expect(js, `${name}.html initial JS ${js.toFixed(1)} KB gzip`).toBeLessThanOrEqual(130); // measured ~127.6 KB after Texuli charts-ui
  });

  it.each(KINDS)('%s.html never reaches the app path, initially or later', (name) => {
    const page = `${name}.html`;
    const initial = initialKeys(asEntry(full, page));
    const reachable = reachableKeys(full, page);
    // Lazy modules index.html defers must not be initial here either.
    for (const [label, pattern] of LAZY_MODULES) {
      expect(
        [...initial].filter((key) => pattern.test(key)),
        `${page} initial: ${label}`
      ).toEqual([]);
    }
    // The app path is not even reachable: the shared player loop receives the
    // kind boot from entries/run-kind.ts and never names boot.ts.
    for (const [label, pattern] of APP_ONLY_MODULES) {
      expect(
        [...reachable].filter((key) => pattern.test(key)),
        `${page} reachable: ${label}`
      ).toEqual([]);
    }
    // The world-generation worker is its own build, referenced by file name
    // from the app boot's chunks; no chunk this page can load names it.
    const reachableCode = [...reachable]
      .map((key) => full[key]?.file)
      .filter((file): file is string => typeof file === 'string' && file.endsWith('.js'))
      .map((file) => readFileSync(join(DIST, file), 'utf8'))
      .join('\n');
    expect(
      /generate\.worker-[\w-]+\.js/.test(reachableCode),
      `${page} reachable: the worker file`
    ).toBe(false);
    // The kind boot itself is reachable (lazy), never initial.
    const kindBoot = [...reachable].filter((key) => /(^|\/)src\/boot-kind\.ts$/.test(key));
    expect(kindBoot, `${page} reaches the kind boot`).toHaveLength(1);
    expect(initial.has(kindBoot[0] as string), `${page}: kind boot is lazy`).toBe(false);
  });

  it.each(KINDS)('%s.html reaches Faker only through the on-demand generator loader', (name) => {
    // `@protoyard/scenarios` loads Faker with a dynamic import when a world is
    // GENERATED; a kind runtime supplies `generateWorld` and no timeline, so
    // that loader never runs (proved below). Its one lazy edge is the only
    // way Faker appears in any page's reachable graph.
    const page = `${name}.html`;
    const fakerKeys = Object.keys(full).filter((key) => /@faker-js\/faker/.test(key));
    expect(fakerKeys.length, 'Faker is in the build (index.html uses it)').toBeGreaterThan(0);
    const initial = initialKeys(asEntry(full, page));
    for (const key of fakerKeys) expect(initial.has(key), `${page} initial: ${key}`).toBe(false);
    const reachable = reachableKeys(full, page);
    for (const key of fakerKeys.filter((k) => reachable.has(k))) {
      const staticImporters = [...reachable].filter((k) => full[k]?.imports?.includes(key));
      const dynamicImporters = [...reachable].filter((k) => full[k]?.dynamicImports?.includes(key));
      expect(staticImporters, `${page}: nothing imports Faker statically`).toEqual([]);
      expect(dynamicImporters, `${page}: one lazy edge to Faker`).toHaveLength(1);
      const loader = readFileSync(
        join(DIST, full[dynamicImporters[0] as string]?.file ?? ''),
        'utf8'
      );
      // The scenarios loader keeps only these three exports of the module.
      expect(/Faker:\w+\.Faker/.test(loader), 'the importer is the scenarios Faker loader').toBe(
        true
      );
    }
  });

  it('a kind runtime generates its world itself and has no timeline (so Faker never loads)', async () => {
    const { parseAnyBlueprint } = await import('@protoyard/blueprint');
    const { defineKindRuntime } = await import('@protoyard/blueprint/kinds');
    const fixtures = join(REPO, 'packages', 'blueprint', 'tests', 'fixtures', 'kinds');
    for (const file of ['intro.deck.json', 'landing.page.json', 'quarterly-report.doc.json']) {
      const blueprint = await parseAnyBlueprint(
        JSON.parse(readFileSync(join(fixtures, file), 'utf8'))
      );
      const definition = defineKindRuntime(blueprint as never, { namespace: 'budget-proof' });
      expect(typeof definition.generateWorld, `${file}: generateWorld`).toBe('function');
      expect(definition.timeline, `${file}: timeline`).toBeUndefined();
    }
  });

  it('reports the measurements', () => {
    console.info(`[player kind pages] ${JSON.stringify(measured)}`);
  });
});
