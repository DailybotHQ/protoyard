/**
 * Scale benchmark for discovery + indexing (`pnpm bench:index`).
 *
 * Generates N synthetic protoyard.json manifests (default 1,000) in a temp
 * workspace — never committed — and measures, with real timers:
 *   1. cold index (no cache), 2. warm index (cache hit, stat only),
 *   3. incremental index after touching 1% of manifests,
 *   4. registry filtering/search, 5. end-to-end `protoyard list --json`
 *      (process start included), and optionally 6. a static gallery build
 *      rendering every entry (--gallery), and 7. the marketplace page with
 *      every entry shelved, measured in headless Chromium (--marketplace).
 *
 * Every synthetic manifest carries a marketplace `catalog` block, so the index
 * measures parsing it too.
 *
 * Results are printed and written to tmp/bench-index-<timestamp>.json.
 *
 *   pnpm bench:index [--count 1000] [--runs 5] [--gallery] [--marketplace] [--keep]
 *                    [--check [--ci-factor 3]]
 *
 * `--marketplace` builds the gallery against the synthetic registry, serves it
 * on an ephemeral 127.0.0.1 port and measures /marketplace/ in headless
 * Chromium: HTML and JS transfer size, time until the browse island is
 * interactive, long tasks while loading, and how long a search and a feature
 * filter take to update the page. It needs Playwright's Chromium
 * (`pnpm test:e2e:install`). With `--check`, those medians are gated against
 * MARKETPLACE_BUDGET (docs/PERFORMANCE.md → Marketplace) × `--ci-factor`.
 *
 * `--check` gates the cold and incremental index medians against
 * `indexColdMs` from protoyard.budgets.json, multiplied by `--ci-factor`
 * (default 3: CI runners are slower than the M1 Max the budget was set on),
 * and exits 1 when either is over. The budget is defined for 1,000 manifests,
 * so `--check` requires the default `--count`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, filterEntries } from '../packages/cli/src/index.ts';
import { loadBudgets } from '../packages/cli/src/lib/budgets.ts';
import { workspacePaths } from '../packages/cli/src/lib/paths.ts';
import { CATALOG_CATEGORIES, createRng } from '../packages/core/src/index.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : Number(process.argv[i + 1]);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
const COUNT = arg('count', 1000);
const RUNS = arg('runs', 5);
const WITH_GALLERY = process.argv.includes('--gallery');
const WITH_MARKETPLACE = process.argv.includes('--marketplace');
const KEEP = process.argv.includes('--keep');
const CHECK = process.argv.includes('--check');
/** Manifest count the index budget is defined for. */
const BUDGET_COUNT = 1000;

function ciFactor(): number {
  const i = process.argv.indexOf('--ci-factor');
  if (i === -1) return 3;
  const value = Number(process.argv[i + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`✗ --ci-factor needs a positive number (got "${process.argv[i + 1] ?? ''}").`);
    process.exit(2);
  }
  return value;
}
const CI_FACTOR = ciFactor();

/** Loads indexColdMs before any work, so a bad budget file or count fails fast. */
async function indexBudget(): Promise<number | null> {
  if (!CHECK) return null;
  if (COUNT !== BUDGET_COUNT) {
    console.error(
      `✗ --check compares against a budget defined for ${BUDGET_COUNT} manifests; drop --count ${COUNT}.`
    );
    process.exit(2);
  }
  try {
    return (await loadBudgets(ROOT)).defaults.indexColdMs;
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

/**
 * Marketplace budget at 1,000 shelved entries (docs/PERFORMANCE.md →
 * Marketplace), multiplied by `--ci-factor` under `--check`. Medians, in ms.
 */
const MARKETPLACE_BUDGET = { interactiveMs: 1000, searchUpdateMs: 50, filterUpdateMs: 100 };

const CATEGORIES = ['sales', 'fintech', 'ai', 'health', 'education', 'ops', 'marketing', 'support'];
const CATALOG_PLATFORMS = ['web', 'mobile', 'tablet', 'desktop', 'widget', 'extension', 'plugin'];
const SHELLS = ['none', 'phone', 'browser', 'desktop-window', 'widget-host', 'side-panel'];
const FEATURES = [
  'auth',
  'billing',
  'roles',
  'search',
  'offline',
  'crud',
  'chat',
  'notifications',
  'csv',
  'voice',
  'kanban',
  'charts',
];
const TAGS = [
  'crm',
  'dashboard',
  'mobile',
  'chat',
  'billing',
  'onboarding',
  'analytics',
  'admin',
  'forms',
  'maps',
  'social',
  'commerce',
];
const PLATFORMS = ['desktop', 'mobile', 'responsive'] as const;
const WORDS = [
  'Pipeline',
  'Ledger',
  'Atlas',
  'Pulse',
  'Harbor',
  'Orbit',
  'Beacon',
  'Signal',
  'Canvas',
  'Relay',
  'Summit',
  'Forge',
];

/** Deterministic synthetic workspace (seeded, so every run measures the same data). */
function generate(root: string, count: number) {
  const rng = createRng(20261017);
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - prototypes/*\n  - templates/*\n'
  );
  for (let i = 0; i < count; i++) {
    const slug = `bench-${String(i).padStart(4, '0')}`;
    const dir = join(root, 'prototypes', slug);
    mkdirSync(dir, { recursive: true });
    const tags = rng.shuffle([...TAGS]).slice(0, rng.int(1, 5));
    const manifest = {
      id: `bench.${slug}`,
      slug,
      kind: 'prototype',
      name: `${rng.pick(WORDS)} ${rng.pick(WORDS)} ${i}`,
      description: `Synthetic prototype ${i} for ${tags.join(', ')} flows.`,
      version: '0.1.0',
      platform: rng.pick(PLATFORMS),
      category: rng.pick(CATEGORIES),
      tags,
      template: 'blank',
      status: 'active',
      storage: { namespace: slug, schemaVersion: rng.int(1, 4) },
      scenarios: Array.from({ length: rng.int(1, 8) }, (_, s) => `scenario-${s + 1}`),
      catalog: {
        category: rng.pick(CATALOG_CATEGORIES),
        productType: `${rng.pick(WORDS)} app`,
        platforms: rng.shuffle([...CATALOG_PLATFORMS]).slice(0, rng.int(1, 3)),
        shell: rng.pick(SHELLS),
        features: rng.shuffle([...FEATURES]).slice(0, rng.int(1, 5)),
        highlights: [`Synthetic highlight ${i}`, `Built for ${tags[0] ?? 'teams'}`],
        difficulty: rng.pick(['beginner', 'intermediate', 'advanced']),
      },
    };
    writeFileSync(join(dir, 'protoyard.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  mkdirSync(join(root, 'templates', 'blank'), { recursive: true });
  writeFileSync(
    join(root, 'templates', 'blank', 'protoyard.json'),
    JSON.stringify({
      id: 'template.blank',
      slug: 'blank',
      kind: 'template',
      name: 'Blank',
      version: '0.1.0',
      storage: { namespace: 'template-blank', schemaVersion: 1 },
    })
  );
}

interface Stats {
  runs: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
}

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    runs: sorted.length,
    minMs: round(sorted[0] ?? 0),
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

async function time(fn: () => Promise<unknown> | unknown): Promise<number> {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

/** Builds the gallery against a registry; returns the build time, status and page count. */
function buildGallery(registryPath: string, outDir: string) {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'apps/gallery/node_modules/astro/bin/astro.mjs'), 'build', '--outDir', outDir],
    {
      cwd: join(ROOT, 'apps/gallery'),
      env: { ...process.env, PROTOYARD_REGISTRY: registryPath },
      encoding: 'utf8',
    }
  );
  const pages = (result.stdout.match(/index\.html/g) ?? []).length;
  if (result.status !== 0) console.error(result.stderr.slice(-2000));
  return { ms: Math.round(performance.now() - started), ok: result.status === 0, pages };
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** Serves a built site on an ephemeral 127.0.0.1 port (directory requests get index.html). */
async function serveDir(dir: string) {
  const { createServer } = await import('node:http');
  const { readFile, stat } = await import('node:fs/promises');
  const { extname, normalize } = await import('node:path');
  const server = createServer(async (req, res) => {
    let file = join(
      dir,
      normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
    );
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res
        .writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** gzip-9 bytes of every JS file a page loads (scripts and island URLs, plus static imports). */
async function pageJsBytes(dist: string, page: string): Promise<number> {
  const { readFileSync, existsSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { gzipSync } = await import('node:zlib');
  const html = readFileSync(join(dist, page), 'utf8');
  const stack = [...html.matchAll(/(?:src|component-url|renderer-url|href)="([^"]+\.js)"/g)].map(
    (m) => join(dist, (m[1] ?? '').replace(/^\//, ''))
  );
  const seen = new Set<string>();
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(
      /(?:^|[;}\s])import\s*(?:[^'"()]*?from\s*)?["'](\.\/?[^"']+\.js)["']/g
    )) {
      stack.push(join(dirname(file), m[1] ?? ''));
    }
  }
  let total = 0;
  for (const file of seen) total += gzipSync(readFileSync(file), { level: 9 }).length;
  return total;
}

/**
 * /marketplace/ with every synthetic entry shelved, in headless Chromium: a
 * fresh page per load run, then search and feature-filter updates timed in the
 * page from the input event until Svelte has updated the DOM.
 */
async function measureMarketplace(dist: string) {
  const { readFileSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  const { chromium } = await import('@playwright/test');
  const html = readFileSync(join(dist, 'marketplace', 'index.html'));
  const site = await serveDir(dist);
  const browser = await chromium.launch();
  try {
    const interactive: number[] = [];
    const longTasks: number[] = [];
    let cards = 0;
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __longTasks: number };
        w.__longTasks = 0;
        new PerformanceObserver((list) => {
          w.__longTasks += list.getEntries().length;
        }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(`${site.url}/marketplace/`, { waitUntil: 'commit' });
      const handle = await page.waitForFunction(
        () => (document.querySelector('section[data-hydrated="true"]') ? performance.now() : 0),
        null,
        { polling: 'raf', timeout: 60_000 }
      );
      interactive.push(Number(await handle.jsonValue()));
      longTasks.push(
        await page.evaluate(() => (window as unknown as { __longTasks: number }).__longTasks)
      );
      cards = await page.locator('[data-testid="market-card"]').count();
      if (i < RUNS - 1) await context.close();
      else {
        const queries = ['pipeline', 'atlas orbit', 'zzz-no-match', 'ledger 42', 'app'];
        const search = await page.evaluate(async (list) => {
          const input = document.querySelector<HTMLInputElement>('[data-testid="market-search"]');
          if (!input) throw new Error('no marketplace search box');
          const out: number[] = [];
          for (let r = 0; r < list.length * 4; r++) {
            const started = performance.now();
            input.value = list[r % list.length] ?? '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((done) => setTimeout(done, 0));
            if (!document.querySelector('[data-testid="market-count"]'))
              throw new Error('no result count');
            out.push(performance.now() - started);
          }
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((done) => setTimeout(done, 0));
          return out;
        }, queries);
        const filter = await page.evaluate(async () => {
          const chips = [
            ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Features"] button'),
          ];
          if (chips.length === 0) throw new Error('no feature filters');
          const out: number[] = [];
          for (let r = 0; r < 20; r++) {
            const chip = chips[r % chips.length] as HTMLButtonElement;
            const started = performance.now();
            chip.click();
            await new Promise((done) => setTimeout(done, 0));
            out.push(performance.now() - started);
            chip.click(); // toggle back off
            await new Promise((done) => setTimeout(done, 0));
          }
          return out;
        });
        await context.close();
        return {
          shelved: cards,
          htmlBytes: html.length,
          htmlGzipBytes: gzipSync(html, { level: 9 }).length,
          jsGzipBytes: await pageJsBytes(dist, 'marketplace/index.html'),
          interactive: stats(interactive),
          longTasksMax: Math.max(...longTasks),
          searchUpdate: stats(search),
          filterUpdate: stats(filter),
        };
      }
    }
    throw new Error('no marketplace runs');
  } finally {
    await browser.close();
    site.close();
  }
}

async function main() {
  const budgetMs = await indexBudget();
  const root = mkdtempSync(join(tmpdir(), 'protoyard-bench-'));
  const paths = workspacePaths(root);
  try {
    const genMs = await time(() => generate(root, COUNT));
    console.log(`Generated ${COUNT} manifests in ${genMs.toFixed(0)} ms → ${root}`);

    const cold: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      rmSync(paths.state, { recursive: true, force: true });
      cold.push(await time(() => buildIndex(paths)));
    }
    const warm: number[] = [];
    let cachedHits = 0;
    for (let i = 0; i < RUNS; i++) {
      warm.push(
        await time(async () => {
          cachedHits = (await buildIndex(paths)).cached;
        })
      );
    }
    const touched = Math.max(1, Math.round(COUNT / 100));
    const incremental: number[] = [];
    let reparsed = 0;
    for (let i = 0; i < RUNS; i++) {
      const when = new Date(Date.now() + (i + 1) * 1000);
      for (let t = 0; t < touched; t++) {
        utimesSync(
          join(root, 'prototypes', `bench-${String(t).padStart(4, '0')}`, 'protoyard.json'),
          when,
          when
        );
      }
      incremental.push(
        await time(async () => {
          reparsed = (await buildIndex(paths)).parsed;
        })
      );
    }

    const { registry } = await buildIndex(paths);
    const queries = ['pipeline', 'ledger 42', 'atlas orbit', 'mobile', 'zzz-no-match'];
    const search: number[] = [];
    let lastCount = 0;
    for (let i = 0; i < RUNS * 20; i++) {
      const q = queries[i % queries.length] ?? '';
      search.push(
        await time(() => {
          lastCount = filterEntries(registry.entries, {
            kind: 'prototype',
            search: q,
            sort: i % 2 ? 'modified' : 'name',
          }).length;
        })
      );
    }

    const cliList: number[] = [];
    let cliOk = true;
    for (let i = 0; i < RUNS; i++) {
      cliList.push(
        await time(() => {
          const result = spawnSync(
            process.execPath,
            [
              join(ROOT, 'node_modules/tsx/dist/cli.mjs'),
              join(ROOT, 'packages/cli/src/bin.ts'),
              '--root',
              root,
              '--json',
              'list',
              '--search',
              'pipeline',
            ],
            { encoding: 'utf8' }
          );
          if (result.status !== 0 || !result.stdout.includes('"ok": true')) cliOk = false;
        })
      );
    }

    let gallery: { ms: number; ok: boolean; pages: number } | null = null;
    let marketplace: Awaited<ReturnType<typeof measureMarketplace>> | null = null;
    if (WITH_GALLERY || WITH_MARKETPLACE) {
      console.log('Building the gallery against the synthetic registry…');
      const outDir = join(root, 'gallery-dist');
      gallery = buildGallery(paths.registry, outDir);
      if (gallery.ok && WITH_MARKETPLACE) {
        console.log('Measuring /marketplace/ in headless Chromium…');
        marketplace = await measureMarketplace(outDir);
      }
    }

    const result = {
      benchmark: 'protoyard index',
      measuredAt: new Date().toISOString(),
      machine: {
        platform: process.platform,
        arch: process.arch,
        cpus: cpus().length,
        cpuModel: cpus()[0]?.model ?? 'unknown',
        node: process.versions.node,
      },
      manifests: COUNT,
      registryEntries: registry.entries.length,
      invalid: registry.invalid.length,
      coldIndex: stats(cold),
      warmIndex: { ...stats(warm), cachedHits },
      incrementalIndex: { ...stats(incremental), touched, reparsed },
      searchFilter: { ...stats(search), lastMatches: lastCount },
      cliListEndToEnd: {
        ...stats(cliList),
        ok: cliOk,
        note: 'includes Node + tsx startup and an incremental re-index',
      },
      gallery,
      marketplace,
      check:
        budgetMs === null
          ? null
          : {
              indexColdMs: budgetMs,
              ciFactor: CI_FACTOR,
              thresholdMs: Math.round(budgetMs * CI_FACTOR * 100) / 100,
              coldOk: stats(cold).medianMs <= budgetMs * CI_FACTOR,
              incrementalOk: stats(incremental).medianMs <= budgetMs * CI_FACTOR,
              ...(marketplace
                ? {
                    marketplace: {
                      budget: MARKETPLACE_BUDGET,
                      interactiveOk:
                        marketplace.interactive.medianMs <=
                        MARKETPLACE_BUDGET.interactiveMs * CI_FACTOR,
                      searchOk:
                        marketplace.searchUpdate.medianMs <=
                        MARKETPLACE_BUDGET.searchUpdateMs * CI_FACTOR,
                      filterOk:
                        marketplace.filterUpdate.medianMs <=
                        MARKETPLACE_BUDGET.filterUpdateMs * CI_FACTOR,
                    },
                  }
                : {}),
            },
    };

    const rows: [string, string][] = [
      [
        `Cold index (${COUNT} manifests)`,
        `${result.coldIndex.medianMs} ms median (min ${result.coldIndex.minMs}, max ${result.coldIndex.maxMs})`,
      ],
      [
        'Warm index (cache)',
        `${result.warmIndex.medianMs} ms median, ${cachedHits}/${COUNT + 1} cached`,
      ],
      [
        `Incremental (${touched} touched)`,
        `${result.incrementalIndex.medianMs} ms median, ${reparsed} re-parsed`,
      ],
      ['Search + sort in memory', `${result.searchFilter.medianMs} ms median`],
      [
        '`protoyard list --json` end to end',
        `${result.cliListEndToEnd.medianMs} ms median${cliOk ? '' : ' (FAILED)'}`,
      ],
      ...(gallery
        ? ([
            [
              'Gallery static build',
              `${gallery.ms} ms, ${gallery.pages} pages, ${gallery.ok ? 'ok' : 'FAILED'}`,
            ],
          ] as [string, string][])
        : []),
      ...(marketplace
        ? ([
            [
              `Marketplace (${marketplace.shelved} cards)`,
              `HTML ${(marketplace.htmlGzipBytes / 1024).toFixed(1)} KB gzip, JS ${(marketplace.jsGzipBytes / 1024).toFixed(1)} KB gzip`,
            ],
            [
              'Marketplace interactive',
              `${marketplace.interactive.medianMs} ms median (min ${marketplace.interactive.minMs}, max ${marketplace.interactive.maxMs}), long tasks ≤ ${marketplace.longTasksMax}`,
            ],
            ['Marketplace search update', `${marketplace.searchUpdate.medianMs} ms median`],
            ['Marketplace feature filter update', `${marketplace.filterUpdate.medianMs} ms median`],
          ] as [string, string][])
        : []),
    ];
    console.log('');
    for (const [label, value] of rows) console.log(`${label.padEnd(40)} ${value}`);

    mkdirSync(join(ROOT, 'tmp'), { recursive: true });
    const file = join(ROOT, 'tmp', `bench-index-${result.measuredAt.replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nWrote ${file}`);
    if (!cliOk || (gallery && !gallery.ok) || (WITH_MARKETPLACE && !marketplace))
      process.exitCode = 1;
    if (result.check) {
      const { check } = result;
      const verdict = (ok: boolean) => (ok ? '✓' : '✗');
      console.log(
        `\nCheck: indexColdMs ${check.indexColdMs} ms × ci-factor ${check.ciFactor} = ${check.thresholdMs} ms` +
          ` · cold ${result.coldIndex.medianMs} ms ${verdict(check.coldOk)}` +
          ` · incremental ${result.incrementalIndex.medianMs} ms ${verdict(check.incrementalOk)}`
      );
      if (check.coldOk && check.incrementalOk) console.log('✓ Index budget check passed.');
      else {
        console.error('✗ Index median over budget.');
        process.exitCode = 1;
      }
      if (check.marketplace && marketplace) {
        const m = check.marketplace;
        const limit = (ms: number) => Math.round(ms * CI_FACTOR * 100) / 100;
        console.log(
          `Check: marketplace interactive ${marketplace.interactive.medianMs} ms ≤ ${limit(m.budget.interactiveMs)} ms ${verdict(m.interactiveOk)}` +
            ` · search ${marketplace.searchUpdate.medianMs} ms ≤ ${limit(m.budget.searchUpdateMs)} ms ${verdict(m.searchOk)}` +
            ` · filter ${marketplace.filterUpdate.medianMs} ms ≤ ${limit(m.budget.filterUpdateMs)} ms ${verdict(m.filterOk)}`
        );
        if (m.interactiveOk && m.searchOk && m.filterOk)
          console.log('✓ Marketplace budget check passed.');
        else {
          console.error('✗ Marketplace median over budget.');
          process.exitCode = 1;
        }
      }
    }
  } finally {
    if (KEEP) console.log(`Kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }
}

await main();
