/**
 * Charts benchmark (`tsx scripts/bench-charts.ts`). Three parts:
 *
 *   1. Node: scale + LTTB + path for 10k and 100k points (@protoyard/charts),
 *      the median of many in-process iterations after a warm-up.
 *   2. Chromium: the ui-kit charts stress demo (`#/c/chart-stress`, 10,000
 *      deterministic points), served from `artifacts/ui-kit/dist` on an
 *      OS-assigned port. Per fresh context and per renderer (SVG with LTTB,
 *      Canvas):
 *        - render: from the renderer switch to the chart in the DOM and laid
 *          out (gated; Canvas includes its one draw frame), and to the
 *          painted frame (reported, it includes the display's vsync);
 *        - hover: a 200-step pointer sweep across the plot, one step per
 *          animation frame; latency is from dispatching `pointermove` to the
 *          DOM updated and laid out (Svelte flushes in a microtask, a
 *          MessageChannel turn later the layout is forced). It excludes the
 *          wait for the next vsync, which is the display's, not the chart's;
 *        - long tasks (> 50 ms, PerformanceObserver) during the sweep.
 *   3. Bundles: a real Vite build (Svelte plugin, packages linked as pnpm
 *      links them) with one lazy import per charts-ui family subpath; each
 *      family's size is the gzip (level 9) of the chunks loading it
 *      downloads beyond the app entry. A second build of the bundle-guard
 *      fixture measures the LineChart + BarChart view and breaks it down by
 *      source area.
 *
 *   tsx scripts/bench-charts.ts [--runs 3] [--check] [--skip-browser] [--skip-bundles]
 *
 * Results (with the machine) go to tmp/bench-charts.json. `--check` exits 1
 * when a threshold in THRESHOLDS is missed. Build first:
 * `pnpm protoyard build ui-kit` (and `pnpm test:e2e:install` once for Chromium).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { type Browser, chromium, type Page } from '@playwright/test';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import {
  downsampleThreshold,
  largestTriangleThreeBuckets,
} from '../packages/charts/src/downsample/index.ts';
import { linearScale } from '../packages/charts/src/scales/index.ts';
import { linePath } from '../packages/charts/src/shapes/index.ts';
import { serveStatic } from '../packages/cli/src/lib/static-server.ts';
import { createRng } from '../packages/core/src/index.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const READY_TIMEOUT_MS = 30_000;
const HOVER_STEPS = 200;
const PLOT_WIDTH = 800;

/** The recorded gates (docs/PERFORMANCE.md → Charts). */
export const THRESHOLDS = {
  /** Node: LTTB of 10,000 points to a plot's threshold. */
  lttb10kMs: 2,
  /** Chromium: a 10,000-point line in the DOM and laid out after a renderer switch, per renderer (median of runs). */
  render10kMs: 50,
  /** Chromium: pointer → DOM updated, p95 over the sweep (worst renderer). */
  hoverP95Ms: 16,
  /** Chromium: long tasks during the hover sweep, per renderer (max over runs). */
  longTasks: 0,
  /** LineChart + BarChart view, gzip bytes: the bundle guard's ceiling (charts-bundle.test.ts). */
  lineBarLazyBytes: 17_000,
} as const;

const FAMILIES = ['cartesian', 'part-whole', 'matrix', 'compact', 'canvas', 'geo'] as const;

interface Stats {
  median: number;
  p95: number;
  min: number;
  max: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return {
    median: round(median),
    p95: round(at(0.95)),
    min: round(sorted[0] as number),
    max: round(sorted.at(-1) as number),
  };
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let runs = 3;
  let check = false;
  let browser = true;
  let bundles = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') check = true;
    else if (arg === '--skip-browser') browser = false;
    else if (arg === '--skip-bundles') bundles = false;
    else if (arg === '--runs') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail('--runs needs a positive integer.');
      runs = value;
    } else
      fail(
        `Unknown option ${arg}. Usage: tsx scripts/bench-charts.ts [--runs 3] [--check] [--skip-browser] [--skip-bundles]`
      );
  }
  return { runs, check, browser, bundles };
}

// ── 1. Node ──────────────────────────────────────────────────────────────

function series(n: number) {
  const rng = createRng(20_261_019);
  let level = 500;
  return Array.from({ length: n }, (_, i) => {
    level = Math.max(0, level + rng.float(-12, 12.4));
    return { x: i, y: level };
  });
}

function benchNode(runs: number) {
  const out: Record<
    string,
    { points: number; scaleMs: Stats; lttbMs: Stats; pathMs: Stats; totalMs: Stats }
  > = {};
  const threshold = downsampleThreshold(PLOT_WIDTH);
  for (const n of [10_000, 100_000]) {
    const raw = series(n);
    const iterations = Math.max(15, runs * 10);
    const scale: number[] = [];
    const lttb: number[] = [];
    const path: number[] = [];
    const total: number[] = [];
    for (let k = -3; k < iterations; k++) {
      const t0 = performance.now();
      const x = linearScale({ domain: [0, n - 1], range: [0, PLOT_WIDTH] });
      const y = linearScale({ domain: [0, 2000], range: [400, 0] });
      const px = raw.map((p) => ({ x: x(p.x), y: y(p.y) }));
      const t1 = performance.now();
      const drawn = largestTriangleThreeBuckets(px, threshold);
      const t2 = performance.now();
      const d = linePath(drawn);
      const t3 = performance.now();
      if (d.length === 0) throw new Error('empty path');
      if (k < 0) continue; // warm-up
      scale.push(t1 - t0);
      lttb.push(t2 - t1);
      path.push(t3 - t2);
      total.push(t3 - t0);
    }
    out[`${n / 1000}k`] = {
      points: n,
      scaleMs: stats(scale),
      lttbMs: stats(lttb),
      pathMs: stats(path),
      totalMs: stats(total),
    };
  }
  return { downsampleTo: threshold, results: out };
}

// ── 2. Chromium ──────────────────────────────────────────────────────────

interface RendererRun {
  renderMs: number;
  paintMs: number;
  hoverMs: number[];
  longTasks: number;
  longestTaskMs: number;
}

/**
 * Switches the stress demo to `renderer`. `renderMs`: from the click to the
 * chart in the DOM and laid out (Svelte flushes in a microtask; polled on
 * MessageChannel turns, so no frame wait is added; Canvas pixels are drawn on
 * the next animation frame by design, so that one wait is included).
 * `paintMs`: to the frame after that, i.e. including the display's vsync.
 */
async function switchRenderer(
  page: Page,
  renderer: 'svg' | 'canvas'
): Promise<{ renderMs: number; paintMs: number }> {
  return page.evaluate(async (target) => {
    const label = target === 'svg' ? 'SVG' : 'Canvas';
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label
    );
    if (!button) throw new Error(`no ${label} button`);
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const channel = new MessageChannel();
    const turn = () =>
      new Promise<void>((r) => {
        channel.port1.onmessage = () => r();
        channel.port2.postMessage(0);
      });
    const host = () =>
      document.querySelector(`[data-stress-chart="line"][data-stress-renderer="${target}"]`);
    const drawn = () => {
      const h = host();
      if (!h?.querySelector('svg[role="group"]')) return false;
      if (target === 'svg') return h.querySelector('path[data-line]') !== null;
      const canvas = h.querySelector('canvas');
      return canvas !== null && canvas.width > 0;
    };
    const t0 = performance.now();
    button.click();
    const deadline = t0 + 10_000;
    while (!drawn() && performance.now() < deadline) await turn();
    if (!drawn()) throw new Error(`${target} chart never drew`);
    host()?.getBoundingClientRect(); // style and layout of the new chart
    const renderMs = performance.now() - t0;
    await frame();
    await frame();
    return { renderMs, paintMs: performance.now() - t0 };
  }, renderer);
}

/** A pointer sweep across the plot, one step per frame; returns per-step latency and long tasks. */
async function hoverSweep(page: Page, renderer: 'svg' | 'canvas', steps: number) {
  return page.evaluate(
    async ({ target, steps }) => {
      const host = document.querySelector(
        `[data-stress-chart="line"][data-stress-renderer="${target}"]`
      );
      const svg = host?.querySelector('svg[role="group"]');
      if (!svg) throw new Error('no plot');
      const rect = svg.getBoundingClientRect();
      const tasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask' });
      const channel = new MessageChannel();
      const turn = () =>
        new Promise<void>((r) => {
          channel.port1.onmessage = () => r();
          channel.port2.postMessage(0);
        });
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const latency: number[] = [];
      for (let i = 0; i < steps; i++) {
        await frame();
        const clientX = rect.left + ((i + 0.5) / steps) * rect.width;
        const clientY = rect.top + rect.height / 2;
        const t0 = performance.now();
        svg.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }));
        await turn(); // Svelte's microtask flush has run.
        svg.getBoundingClientRect(); // Style and layout of the updated crosshair and tooltip.
        latency.push(performance.now() - t0);
      }
      await frame();
      await frame();
      observer.disconnect();
      const tooltip = host?.querySelector('[role="tooltip"], [data-chart-tooltip]') !== null;
      return { latency, tasks, tooltip };
    },
    { target: renderer, steps }
  );
}

async function benchBrowser(runs: number) {
  const dist = join(ROOT, 'artifacts', 'ui-kit', 'dist');
  const manifestPath = join(ROOT, 'artifacts', 'ui-kit', 'build-manifest.json');
  if (!existsSync(join(dist, 'index.html')) || !existsSync(manifestPath)) {
    fail('No ui-kit build. Run `pnpm protoyard build ui-kit` first.');
  }
  const { base } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { base: string };
  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    fail(
      `Could not start headless Chromium (${error instanceof Error ? error.message.split('\n')[0] : String(error)}). Run \`pnpm test:e2e:install\` once.`
    );
  }
  const server = await serveStatic({
    dir: dist,
    base,
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
  });
  const perRenderer: Record<'svg' | 'canvas', RendererRun[]> = { svg: [], canvas: [] };
  const routeMs: number[] = [];
  let tooltipSeen = true;
  try {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      try {
        // tsx keeps function names with a `__name` helper that does not exist in the page.
        await context.addInitScript('globalThis.__name = (fn) => fn;');
        const page = await context.newPage();
        page.on('pageerror', (error) => console.error(`  ! page error: ${error.message}`));
        await page.goto(`${server.url}#/c/chart-stress`, { waitUntil: 'commit' });
        await page.waitForSelector('html[data-protoyard-ready="1"]', {
          state: 'attached',
          timeout: READY_TIMEOUT_MS,
        });
        await page.waitForSelector('[data-stress-chart="line"] svg[role="group"]', {
          timeout: READY_TIMEOUT_MS,
        });
        // Informational: navigation start → stress chart on screen (app boot, scenario, lazy chunks).
        routeMs.push(await page.evaluate(() => performance.now()));
        // Switch twice per renderer: the first Canvas switch also downloads its chunk; the second is the measurement.
        for (const renderer of ['svg', 'canvas', 'svg', 'canvas'] as const)
          await switchRenderer(page, renderer);
        for (const renderer of ['svg', 'canvas'] as const) {
          const { renderMs, paintMs } = await switchRenderer(page, renderer);
          const sweep = await hoverSweep(page, renderer, HOVER_STEPS);
          tooltipSeen &&= sweep.tooltip;
          perRenderer[renderer].push({
            renderMs,
            paintMs,
            hoverMs: sweep.latency,
            longTasks: sweep.tasks.length,
            longestTaskMs: Math.max(0, ...sweep.tasks),
          });
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
    await browser.close().catch(() => {});
  }
  const summary = (runsOf: RendererRun[]) => ({
    renderMs: stats(runsOf.map((r) => r.renderMs)),
    paintMs: stats(runsOf.map((r) => r.paintMs)),
    hoverMs: stats(runsOf.flatMap((r) => r.hoverMs)),
    longTasks: Math.max(...runsOf.map((r) => r.longTasks)),
    longestTaskMs: round(Math.max(...runsOf.map((r) => r.longestTaskMs))),
  });
  return {
    chromium: browser.version(),
    points: 10_000,
    hoverSteps: HOVER_STEPS,
    routeMs: stats(routeMs),
    tooltipSeen,
    svg: summary(perRenderer.svg),
    canvas: summary(perRenderer.canvas),
  };
}

// ── 3. Bundles ───────────────────────────────────────────────────────────

const gzip = (code: string | Uint8Array) => gzipSync(code, { level: 9 }).length;

async function linkedApp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
  for (const pkg of ['charts-ui', 'charts']) {
    await symlink(join(ROOT, 'packages', pkg), join(dir, 'node_modules/@protoyard', pkg), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');
  return dir;
}

async function viteBuild(
  dir: string,
  input: Record<string, string>
): Promise<Rollup.OutputChunk[]> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const result = await build({
      mode: 'production',
      root: dir,
      configFile: false,
      logLevel: 'silent',
      plugins: [svelte()],
      build: { outDir: join(dir, 'dist'), emptyOutDir: true, rollupOptions: { input } },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
    return outputs
      .flatMap((o) => o.output)
      .filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
  } finally {
    process.env.NODE_ENV = previous;
  }
}

/** Chunks a dynamic import downloads: its chunk and its static imports, minus what `have` already loaded. */
function closure(
  chunks: Rollup.OutputChunk[],
  start: Rollup.OutputChunk,
  have: Set<string>
): Rollup.OutputChunk[] {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const seen = new Set<string>();
  const queue = [start.fileName];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file) || have.has(file)) continue;
    seen.add(file);
    for (const next of byFile.get(file)?.imports ?? []) queue.push(next);
  }
  return [...seen].map((f) => byFile.get(f) as Rollup.OutputChunk);
}

function entryClosure(chunks: Rollup.OutputChunk[], name: string): Set<string> {
  const entry = chunks.find((c) => c.isEntry && c.name === name);
  if (!entry) throw new Error(`no entry ${name}`);
  return new Set(closure(chunks, entry, new Set()).map((c) => c.fileName));
}

const AREAS: [string, RegExp][] = [
  ['svelte runtime', /node_modules\/svelte\//],
  ['frame', /charts-ui\/src\/frame\//],
  ['interaction', /charts-ui\/src\/interaction\//],
  ['cartesian', /charts-ui\/src\/cartesian\//],
  ['canvas (model)', /charts-ui\/src\/canvas\//],
  ['charts: scales', /packages\/charts\/src\/scales\//],
  ['charts: shapes', /packages\/charts\/src\/shapes\//],
  ['charts: downsample', /packages\/charts\/src\/downsample\//],
  ['charts: palette', /packages\/charts\/src\/palette\//],
  ['charts: other', /packages\/charts\/src\//],
];

async function benchBundles() {
  // a) One lazy import per family subpath (whole subpath: every component it exports).
  const dir = await linkedApp('protoyard-bench-charts-');
  const families: Record<string, number> = {};
  try {
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html><html><body><div id="app"></div><script type="module" src="./main.ts"></script></body></html>'
    );
    await writeFile(
      join(dir, 'main.ts'),
      `import { mount } from 'svelte';\nvoid mount;\nexport const loaders = {\n${FAMILIES.map((f) => `  '${f}': () => import('@protoyard/charts-ui/${f}'),`).join('\n')}\n};\n(globalThis as Record<string, unknown>).loaders = loaders;\n`
    );
    const chunks = await viteBuild(dir, { app: join(dir, 'index.html') });
    const have = entryClosure(chunks, 'app');
    const entry = chunks.find((c) => c.isEntry && c.name === 'app') as Rollup.OutputChunk;
    for (const family of FAMILIES) {
      const file = entry.dynamicImports.find((f) =>
        chunks
          .find((c) => c.fileName === f)
          ?.moduleIds.some((id) =>
            id.replaceAll('\\', '/').includes(`/charts-ui/src/${family}/index.ts`)
          )
      );
      const start = chunks.find((c) => c.fileName === file);
      if (!start) throw new Error(`no chunk for ${family}`);
      families[family] = closure(chunks, start, have).reduce((s, c) => s + gzip(c.code), 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // b) The bundle-guard fixture: the LineChart + BarChart view, broken down by area.
  const fixture = await linkedApp('protoyard-bench-linebar-');
  let lineBar = 0;
  const breakdown: Record<string, number> = {};
  try {
    await cp(join(ROOT, 'tests/fixtures/charts-prototype'), fixture, { recursive: true });
    const chunks = await viteBuild(fixture, {
      app: join(fixture, 'index.html'),
      baseline: join(fixture, 'baseline.html'),
    });
    const have = entryClosure(chunks, 'app');
    const entry = chunks.find((c) => c.isEntry && c.name === 'app') as Rollup.OutputChunk;
    const start = entry.dynamicImports
      .map((f) => chunks.find((c) => c.fileName === f) as Rollup.OutputChunk)
      .find((c) =>
        c?.moduleIds.some((id) => id.replaceAll('\\', '/').includes('/cartesian/LineChart.svelte'))
      );
    if (!start) throw new Error('no LineChart chunk in the fixture build');
    const view = closure(chunks, start, have);
    lineBar = view.reduce((s, c) => s + gzip(c.code), 0);
    // Gzip each chunk's share by rendered (minified) length per source area: an estimate, labelled as such.
    for (const chunk of view) {
      const size = gzip(chunk.code);
      const rendered = Object.values(chunk.modules).reduce((s, m) => s + m.renderedLength, 0) || 1;
      for (const [id, info] of Object.entries(chunk.modules)) {
        const path = id.replaceAll('\\', '/');
        const area = AREAS.find(([, re]) => re.test(path))?.[0] ?? 'other';
        breakdown[area] = (breakdown[area] ?? 0) + (size * info.renderedLength) / rendered;
      }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
  return {
    familiesGzipBytes: families,
    lineBarLazyGzipBytes: lineBar,
    lineBarBreakdownGzipBytes: Object.fromEntries(
      Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, Math.round(v)])
    ),
  };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const { runs, check, browser, bundles } = parseArgs(process.argv.slice(2));
  const cpu = cpus();
  const machine = {
    cpu: cpu[0]?.model.trim() ?? 'unknown',
    cores: cpu.length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()} (${arch()})`,
    node: process.versions.node,
  };
  console.log(
    `Charts bench · ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGb} GB · ${machine.os} · Node ${machine.node}`
  );

  const node = benchNode(runs);
  for (const [key, r] of Object.entries(node.results)) {
    console.log(
      `  Node ${key.padEnd(5)} scale ${r.scaleMs.median} ms · LTTB → ${node.downsampleTo} ${r.lttbMs.median} ms · path ${r.pathMs.median} ms · total ${r.totalMs.median} ms (median)`
    );
  }

  const chromiumResult = browser ? await benchBrowser(runs) : null;
  if (chromiumResult) {
    console.log(
      `  Chromium ${chromiumResult.chromium} · ${runs} fresh context(s) · stress route ready in ${chromiumResult.routeMs.median} ms (median, informational)`
    );
    for (const renderer of ['svg', 'canvas'] as const) {
      const r = chromiumResult[renderer];
      console.log(
        `  ${renderer.padEnd(6)} render ${r.renderMs.median} ms (max ${r.renderMs.max}; painted ${r.paintMs.median} ms) · hover p50 ${r.hoverMs.median} ms, p95 ${r.hoverMs.p95} ms · long tasks ${r.longTasks}${r.longTasks ? ` (longest ${r.longestTaskMs} ms)` : ''}`
      );
    }
  }

  const bundleResult = bundles ? await benchBundles() : null;
  if (bundleResult) {
    console.log(
      `  Subpaths (gzip, whole family beyond the app entry): ${Object.entries(
        bundleResult.familiesGzipBytes
      )
        .map(([k, v]) => `${k} ${v.toLocaleString('en-US')} B`)
        .join(' · ')}`
    );
    console.log(
      `  LineChart + BarChart view ${bundleResult.lineBarLazyGzipBytes.toLocaleString('en-US')} B: ${Object.entries(
        bundleResult.lineBarBreakdownGzipBytes
      )
        .map(([k, v]) => `${k} ~${v.toLocaleString('en-US')}`)
        .join(', ')}`
    );
  }

  const checks: { name: string; value: number; limit: number; ok: boolean }[] = [];
  const add = (name: string, value: number, limit: number) =>
    checks.push({ name, value, limit, ok: value <= limit });
  add(
    'LTTB 10k (ms, median)',
    node.results['10k']?.lttbMs.median ?? Number.POSITIVE_INFINITY,
    THRESHOLDS.lttb10kMs
  );
  if (chromiumResult) {
    // The tooltip renders only while a point is hovered: without it the sweep measured nothing.
    add('hover sweep showed the tooltip (0 = yes)', chromiumResult.tooltipSeen ? 0 : 1, 0);
    for (const renderer of ['svg', 'canvas'] as const) {
      const r = chromiumResult[renderer];
      add(`${renderer} 10k render (ms, median)`, r.renderMs.median, THRESHOLDS.render10kMs);
      add(`${renderer} hover p95 (ms)`, r.hoverMs.p95, THRESHOLDS.hoverP95Ms);
      add(`${renderer} long tasks during hover`, r.longTasks, THRESHOLDS.longTasks);
    }
  }
  if (bundleResult)
    add(
      'LineChart + BarChart view (gzip B)',
      bundleResult.lineBarLazyGzipBytes,
      THRESHOLDS.lineBarLazyBytes
    );

  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const out = join(ROOT, 'tmp', 'bench-charts.json');
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        format: 'protoyard.bench-charts',
        version: 1,
        measuredAt: new Date().toISOString(),
        runs,
        machine: { ...machine, ...(chromiumResult ? { chromium: chromiumResult.chromium } : {}) },
        thresholds: THRESHOLDS,
        node,
        chromium: chromiumResult,
        bundles: bundleResult,
        checks,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${out}`);

  if (!check) return;
  for (const c of checks)
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.value} (limit ${c.limit})`);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} charts threshold(s) missed.`);
    process.exit(1);
  }
  console.log('✓ Charts bench check passed.');
}

await main();
