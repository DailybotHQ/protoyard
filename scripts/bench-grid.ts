/**
 * Data grid benchmark (`tsx scripts/bench-grid.ts`): measures the 100,000-row
 * claim of `@protoyard/views-ui/grid` instead of asserting it.
 *
 * Builds ui-kit (unless --skip-build), serves `artifacts/ui-kit/dist` with the
 * CLI's static server on an OS-assigned port (never the fixed E2E ports), and,
 * --runs times, opens a FRESH headless Chromium context at 1280×800 on the
 * grid demo (`#/c/grid`, prototypes/ui-kit/src/demos/views/GridDemo.svelte).
 * It then presses "Load 100,000 rows". The demo builds those rows in memory in
 * the page, not in IndexedDB, so the bench measures rendering and
 * virtualization, not storage. Per run it records:
 *
 *   1. first render: ms from the click to the first painted frame where the
 *      grid reports every row (`aria-rowcount`) and shows its first data row;
 *   2. DOM rows: `[role="row"]` elements in the grid after that render, and
 *      the most seen during the scroll (virtualization keeps it bounded);
 *   3. a scripted 5-second scroll (one `scrollTop` step per animation frame,
 *      top to bottom of the 100k rows): long tasks (PerformanceObserver
 *      `longtask`, all and over 200 ms) and dropped frames (frame gaps beyond
 *      one 60 Hz interval, counted in missed intervals).
 *
 * Medians are printed and written to tmp/bench-grid-<timestamp>.json with
 * the machine, like scripts/bench-cold-start.ts.
 *
 *   tsx scripts/bench-grid.ts [--rows 100000] [--runs 3] [--check] [--skip-build]
 *
 * `--check` compares the medians with THRESHOLDS below and exits 1 when one is
 * over. Under CI (`CI` set) the check reports only until the thresholds are
 * calibrated on a CI runner (CI_CALIBRATED), as the cold-start budget does.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
import { serveStatic } from '../packages/cli/src/lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SLUG = 'ui-kit';
/** Rows the demo's stress mode renders (GridDemo.svelte). */
const DEMO_ROWS = 100_000;
const SCROLL_MS = 5_000;
const READY_TIMEOUT_MS = 30_000;

/** Gate for `--check`, compared with the medians of the runs. */
export const THRESHOLDS = {
  /** Click → first painted frame with every row known. */
  firstRenderMs: 500,
  /** `[role="row"]` elements in the grid, header included. */
  maxDomRows: 80,
  /** Long tasks over 200 ms during the 5-second scroll. */
  longTasksOver200: 0,
} as const;

/** Set to true once THRESHOLDS are calibrated on a CI runner; until then CI only reports. */
const CI_CALIBRATED = false;

interface Run {
  firstRenderMs: number;
  domRows: number;
  maxDomRowsWhileScrolling: number;
  longTasks: number;
  longTasksOver200: number;
  longestTaskMs: number;
  frames: number;
  droppedFrames: number;
  longestFrameMs: number;
  /** Fraction of the grid's scroll height covered by the scripted scroll. */
  scrolledFraction: number;
  /** The last data row (`Record <rows>`) was rendered at the end of the scroll. */
  reachedLastRow: boolean;
}

interface Stats {
  median: number;
  min: number;
  max: number;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let rows = DEMO_ROWS;
  let runs = 3;
  let check = false;
  let skipBuild = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') check = true;
    else if (arg === '--skip-build') skipBuild = true;
    else if (arg === '--runs' || arg === '--rows') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail(`${arg} needs a positive integer.`);
      if (arg === '--runs') runs = value;
      else rows = value;
    } else
      fail(
        `Unknown option ${arg}. Usage: tsx scripts/bench-grid.ts [--rows 100000] [--runs 3] [--check] [--skip-build]`
      );
  }
  if (rows !== DEMO_ROWS) {
    fail(
      `--rows ${rows}: the ui-kit grid demo's stress mode renders exactly ${DEMO_ROWS.toLocaleString('en')} rows (GridDemo.svelte), so that is the only size this bench can measure.`
    );
  }
  return { rows, runs, check, skipBuild };
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    median: round(median),
    min: round(sorted[0] as number),
    max: round(sorted[sorted.length - 1] as number),
  };
}

/** Opens the grid demo, loads the rows and scrolls; everything timed in the page. */
async function measure(page: Page, rows: number): Promise<Run> {
  await page.waitForSelector('html[data-protoyard-ready="1"]', {
    state: 'attached',
    timeout: READY_TIMEOUT_MS,
  });
  const load = page.getByRole('button', { name: 'Load 100,000 rows' });
  await load.waitFor({ timeout: READY_TIMEOUT_MS });
  await page.locator('[data-grid] [role="grid"]').waitFor({ timeout: READY_TIMEOUT_MS });
  // Let the demo route settle (lazy chunks, fonts) before timing the click.
  await page.waitForTimeout(500);

  return page.evaluate(
    async ({ rows, scrollMs }) => {
      const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
      const grid = document.querySelector<HTMLElement>('[data-grid] [role="grid"]');
      const scroller = grid?.parentElement;
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Load 100,000 rows')
      );
      if (!grid || !scroller || !button) throw new Error('grid demo not found');
      const rowCount = () => grid.querySelectorAll('[role="row"]').length;

      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });

      // 1. First render: click → first frame with every row known and row 1 shown.
      const t0 = performance.now();
      button.click();
      for (;;) {
        await nextFrame();
        const ready =
          grid.getAttribute('aria-rowcount') === String(rows + 1) &&
          grid.querySelector('[role="row"][aria-rowindex="2"]')?.textContent?.includes('Record 1');
        if (ready) break;
        if (performance.now() - t0 > 30_000) throw new Error('rows never rendered');
      }
      await nextFrame();
      const firstRenderMs = performance.now() - t0;
      const domRows = rowCount();

      // 2. Scripted scroll: one step per frame, top to bottom over scrollMs.
      observer.observe({ type: 'longtask', buffered: false });
      const distance = scroller.scrollHeight - scroller.clientHeight;
      let maxRows = domRows;
      let frames = 0;
      let dropped = 0;
      let longestFrame = 0;
      const start = await nextFrame();
      let last = start;
      for (;;) {
        const now = await nextFrame();
        const gap = now - last;
        last = now;
        frames += 1;
        longestFrame = Math.max(longestFrame, gap);
        dropped += Math.max(0, Math.round(gap / (1000 / 60)) - 1);
        const progress = Math.min(1, (now - start) / scrollMs);
        scroller.scrollTop = distance * progress;
        maxRows = Math.max(maxRows, rowCount());
        if (progress >= 1) break;
      }
      await nextFrame();
      await nextFrame();
      observer.disconnect();
      const lastRow = grid.querySelector(`[role="row"][aria-rowindex="${rows + 1}"]`);
      return {
        firstRenderMs,
        domRows,
        maxDomRowsWhileScrolling: maxRows,
        longTasks: longTasks.length,
        longTasksOver200: longTasks.filter((d) => d > 200).length,
        longestTaskMs: longTasks.length ? Math.max(...longTasks) : 0,
        frames,
        droppedFrames: dropped,
        longestFrameMs: longestFrame,
        scrolledFraction: distance > 0 ? scroller.scrollTop / distance : 0,
        reachedLastRow: Boolean(lastRow?.textContent?.includes(`Record ${rows}`)),
      };
    },
    { rows, scrollMs: SCROLL_MS }
  );
}

async function main() {
  const { rows, runs, check, skipBuild } = parseArgs(process.argv.slice(2));
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['protoyard', 'build', SLUG], { cwd: ROOT, encoding: 'utf8' });
    if (build.status !== 0)
      fail(`pnpm protoyard build ${SLUG} failed:\n${build.stdout}${build.stderr}`);
  }
  const dist = join(ROOT, 'artifacts', SLUG, 'dist');
  const manifestPath = join(ROOT, 'artifacts', SLUG, 'build-manifest.json');
  if (!existsSync(join(dist, 'index.html')) || !existsSync(manifestPath)) {
    fail(`No build for ${SLUG}. Run \`pnpm protoyard build ${SLUG}\` or drop --skip-build.`);
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
  const cpu = cpus();
  const machine = {
    cpu: cpu[0]?.model.trim() ?? 'unknown',
    cores: cpu.length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()} (${arch()})`,
    node: process.versions.node,
    chromium: browser.version(),
  };
  console.log(
    `Data grid, ${rows.toLocaleString('en')} in-memory rows, median of ${runs} fresh contexts · ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGb} GB · ${machine.os} · Node ${machine.node} · Chromium ${machine.chromium}`
  );

  // Port 0: the OS assigns a free port, so a running E2E session never collides.
  const server = await serveStatic({
    dir: dist,
    base,
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
  });
  const samples: Run[] = [];
  try {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        // tsx (esbuild keepNames) wraps named functions in the evaluated callback with
        // `__name(fn, "name")`; the page has no such helper, so give it a no-op one.
        await context.addInitScript('globalThis.__name = (fn) => fn;');
        const page = await context.newPage();
        page.on('pageerror', (error) => console.error(`  ! page error: ${error.message}`));
        await page.goto(`${server.url}?devtools=0#/c/grid`, { waitUntil: 'commit' });
        const sample = await measure(page, rows);
        samples.push(sample);
        console.log(
          `  run ${run + 1}: first render ${sample.firstRenderMs.toFixed(1)} ms · ${sample.domRows} DOM rows (max ${sample.maxDomRowsWhileScrolling} while scrolling)` +
            ` · ${sample.longTasks} long tasks (${sample.longTasksOver200} over 200 ms, longest ${sample.longestTaskMs.toFixed(0)} ms)` +
            ` · ${sample.droppedFrames} dropped frames of ${sample.frames} (longest ${sample.longestFrameMs.toFixed(0)} ms) · scrolled ${Math.round(sample.scrolledFraction * 100)}%${sample.reachedLastRow ? ', last row shown' : ', LAST ROW NOT SHOWN'}`
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
    await browser.close();
  }

  const summary = {
    firstRenderMs: stats(samples.map((s) => s.firstRenderMs)),
    domRows: stats(samples.map((s) => Math.max(s.domRows, s.maxDomRowsWhileScrolling))),
    longTasks: stats(samples.map((s) => s.longTasks)),
    longTasksOver200: stats(samples.map((s) => s.longTasksOver200)),
    droppedFrames: stats(samples.map((s) => s.droppedFrames)),
    longestFrameMs: stats(samples.map((s) => s.longestFrameMs)),
  };
  // A run that never showed the last row did not exercise the whole list: not a pass.
  const incomplete = samples.filter((s) => !s.reachedLastRow).length;
  if (incomplete > 0) console.error(`  ! ${incomplete} run(s) never rendered the last row.`);
  const verdicts = {
    reachedLastRow: incomplete === 0,
    firstRenderMs: summary.firstRenderMs.median <= THRESHOLDS.firstRenderMs,
    maxDomRows: summary.domRows.median <= THRESHOLDS.maxDomRows,
    longTasksOver200: summary.longTasksOver200.median <= THRESHOLDS.longTasksOver200,
  };
  const mark = (ok: boolean) => (ok ? '✓' : '✗');
  console.log(
    `Median: first render ${summary.firstRenderMs.median} ms (≤ ${THRESHOLDS.firstRenderMs} ${mark(verdicts.firstRenderMs)})` +
      ` · DOM rows ${summary.domRows.median} (≤ ${THRESHOLDS.maxDomRows} ${mark(verdicts.maxDomRows)})` +
      ` · long tasks over 200 ms ${summary.longTasksOver200.median} (≤ ${THRESHOLDS.longTasksOver200} ${mark(verdicts.longTasksOver200)})` +
      ` · dropped frames ${summary.droppedFrames.median} · long tasks ${summary.longTasks.median}`
  );

  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(ROOT, 'tmp', `bench-grid-${stamp}.json`);
  writeFileSync(
    out,
    `${JSON.stringify({ format: 'protoyard.bench-grid', version: 1, measuredAt: new Date().toISOString(), rows, runs, scrollMs: SCROLL_MS, viewport: '1280x800', machine, thresholds: THRESHOLDS, summary, verdicts, samples }, null, 2)}\n`
  );
  console.log(`Wrote ${out}`);

  if (!check) return;
  const failed = Object.entries(verdicts)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  if (failed.length === 0) {
    console.log('✓ Grid check passed.');
    return;
  }
  if (process.env.CI && !CI_CALIBRATED) {
    console.log(
      `Over the grid thresholds (${failed.join(', ')}), reported only: thresholds are not calibrated on CI yet.`
    );
    return;
  }
  console.error(`✗ Over the grid thresholds: ${failed.join(', ')}.`);
  process.exit(1);
}

await main();
