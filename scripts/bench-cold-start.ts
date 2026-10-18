/**
 * Cold-start benchmark for built prototypes (`tsx scripts/bench-cold-start.ts`).
 *
 * For each slug: serve `artifacts/<slug>/dist` with the CLI's static server on
 * an OS-assigned port (never the fixed E2E ports), then, --runs times, open a
 * FRESH headless Chromium context and measure, from navigation start:
 *   1. first visit: an empty IndexedDB, so the default scenario is generated
 *      and written before the app renders;
 *   2. repeat visit: a reload in the same context, so the stored world is
 *      reused (and the HTTP cache is warm).
 * The time is the `protoyard:ready` performance mark that mountPrototype sets
 * once the world exists and the first screen rendered. Medians are printed
 * and written to tmp/bench-cold-start-<timestamp>.json with the machine.
 *
 *   tsx scripts/bench-cold-start.ts <slug…> [--runs 5] [--check]
 *
 * `--check` compares both medians with `coldStartMs` from protoyard.budgets.json
 * (per-prototype overrides apply) and exits 1 when one is over. A null budget
 * means "not calibrated yet": the numbers are reported and the check passes.
 * Build first: `pnpm protoyard build <slug>`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';
import { loadBudgets, resolveBudget } from '../packages/cli/src/lib/budgets.ts';
import { serveStatic } from '../packages/cli/src/lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const READY_TIMEOUT_MS = 30_000;

interface Visit {
  /** ms from navigation start to `protoyard:ready`. */
  readyMs: number;
  /** ms from navigation start to `protoyard:world-ready`. */
  worldReadyMs: number;
  /** Whether this visit generated the world (from the mark's detail). */
  seeded: boolean | null;
}

interface Stats {
  median: number;
  min: number;
  max: number;
}

interface SlugResult {
  slug: string;
  runs: number;
  firstVisit: { ready: Stats; worldReady: Stats; samples: Visit[] };
  repeatVisit: { ready: Stats; worldReady: Stats; samples: Visit[] };
  budgetMs: number | null;
  /** null when no budget is set. */
  withinBudget: boolean | null;
}

function parseArgs(argv: string[]): { slugs: string[]; runs: number; check: boolean } {
  const slugs: string[] = [];
  let runs = 5;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') check = true;
    else if (arg === '--runs') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail('--runs needs a positive integer.');
      runs = value;
    } else if (arg.startsWith('--')) fail(`Unknown option ${arg}.`);
    else if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(arg)) slugs.push(arg);
    else fail(`Invalid slug "${arg}".`);
  }
  if (slugs.length === 0) {
    fail('Usage: tsx scripts/bench-cold-start.ts <slug…> [--runs 5] [--check]');
  }
  return { slugs: [...new Set(slugs)], runs, check };
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
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

/** Reads the marks of the current document (startTime is relative to navigation start). */
async function readMarks(page: import('@playwright/test').Page): Promise<Visit> {
  await page.waitForSelector('html[data-protoyard-ready="1"]', {
    state: 'attached',
    timeout: READY_TIMEOUT_MS,
  });
  return page.evaluate(() => {
    const ready = performance.getEntriesByName('protoyard:ready', 'mark')[0];
    const world = performance.getEntriesByName('protoyard:world-ready', 'mark')[0] as
      | PerformanceMark
      | undefined;
    if (!ready || !world) throw new Error('protoyard performance marks are missing');
    const detail = world.detail as { seeded?: unknown } | null;
    return {
      readyMs: ready.startTime,
      worldReadyMs: world.startTime,
      seeded: typeof detail?.seeded === 'boolean' ? detail.seeded : null,
    };
  });
}

async function benchSlug(
  browser: Browser,
  slug: string,
  runs: number
): Promise<Omit<SlugResult, 'budgetMs' | 'withinBudget'>> {
  const dist = join(ROOT, 'artifacts', slug, 'dist');
  const manifestPath = join(ROOT, 'artifacts', slug, 'build-manifest.json');
  if (!existsSync(join(dist, 'index.html')) || !existsSync(manifestPath)) {
    fail(`No build for ${slug}. Run \`pnpm protoyard build ${slug}\` first.`);
  }
  const { base } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { base: string };
  // Port 0: the OS assigns a free port, so a running E2E session never collides.
  const server = await serveStatic({
    dir: dist,
    base,
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
  });
  const first: Visit[] = [];
  const repeat: Visit[] = [];
  try {
    for (let run = 0; run < runs; run++) {
      // A fresh context per run: empty IndexedDB, storage and HTTP cache.
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        page.on('pageerror', (error) => console.error(`  ! ${slug}: page error: ${error.message}`));
        await page.goto(server.url, { waitUntil: 'commit' });
        first.push(await readMarks(page));
        await page.reload({ waitUntil: 'commit' });
        repeat.push(await readMarks(page));
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
  }
  if (first.some((v) => v.seeded === false) || repeat.some((v) => v.seeded === true)) {
    console.error(
      `  ! ${slug}: unexpected seeding (first visits should generate, repeat visits should not).`
    );
  }
  return {
    slug,
    runs,
    firstVisit: {
      ready: stats(first.map((v) => v.readyMs)),
      worldReady: stats(first.map((v) => v.worldReadyMs)),
      samples: first,
    },
    repeatVisit: {
      ready: stats(repeat.map((v) => v.readyMs)),
      worldReady: stats(repeat.map((v) => v.worldReadyMs)),
      samples: repeat,
    },
  };
}

async function main() {
  const { slugs, runs, check } = parseArgs(process.argv.slice(2));
  const budgets = await loadBudgets(ROOT);
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
    `Cold start, median of ${runs} fresh contexts · ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGb} GB · ${machine.os} · Node ${machine.node} · Chromium ${machine.chromium}`
  );
  const results: SlugResult[] = [];
  try {
    for (const slug of slugs) {
      const measured = await benchSlug(browser, slug, runs);
      const budgetMs = resolveBudget(budgets, slug).coldStartMs;
      const withinBudget =
        budgetMs === null
          ? null
          : measured.firstVisit.ready.median <= budgetMs &&
            measured.repeatVisit.ready.median <= budgetMs;
      results.push({ ...measured, budgetMs, withinBudget });
      const f = measured.firstVisit;
      const r = measured.repeatVisit;
      console.log(
        `  ${slug.padEnd(24)} first visit ${f.ready.median} ms (world ${f.worldReady.median} ms, range ${f.ready.min}–${f.ready.max})` +
          ` · repeat ${r.ready.median} ms (world ${r.worldReady.median} ms, range ${r.ready.min}–${r.ready.max})` +
          (budgetMs === null ? '' : ` · budget ${budgetMs} ms ${withinBudget ? '✓' : '✗'}`)
      );
    }
  } finally {
    await browser.close();
  }

  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(ROOT, 'tmp', `bench-cold-start-${stamp}.json`);
  writeFileSync(
    out,
    `${JSON.stringify({ format: 'protoyard.bench-cold-start', version: 1, measuredAt: new Date().toISOString(), runs, machine, results }, null, 2)}\n`
  );
  console.log(`Wrote ${out}`);

  if (!check) return;
  const unset = results.filter((r) => r.budgetMs === null).map((r) => r.slug);
  if (unset.length > 0) {
    console.log(
      `coldStartMs is not calibrated in protoyard.budgets.json for ${unset.join(', ')}: reported only, not gated.`
    );
  }
  const over = results.filter((r) => r.withinBudget === false);
  if (over.length > 0) {
    console.error(`✗ Over the cold-start budget: ${over.map((r) => r.slug).join(', ')}.`);
    process.exit(1);
  }
  console.log('✓ Cold-start check passed.');
}

await main();
