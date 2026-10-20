/**
 * Player benchmark (`pnpm exec tsx scripts/bench-player.ts`): how long a
 * blueprint takes to become a running prototype in the prebuilt player.
 *
 * It serves a copy of the built player (`packages/player/dist`) with the
 * CLI's static server on an OS-assigned port, then for each blueprint and
 * --runs times opens a FRESH headless Chromium context and measures:
 *   1. first visit: the blueprint arrives as a `#bp=` share link (or, when it
 *      is too large for a link, `?src=./bench-blueprints/<name>.json`). The
 *      player decodes it, generates the default scenario's world in its worker
 *      and seeds IndexedDB. Time from navigation start to `protoyard:ready`.
 *   2. repeat visit: a reload, which reuses the stored world.
 *   3. scenario switch, cache miss: `scenarios.load('empty')` generates a world.
 *   4. scenario switch, cache hit: `scenarios.load('active')` again; the player's
 *      world cache serves it, so no world-generation worker starts.
 *
 * The blueprints are 5 catalog blueprints plus the large fixture
 * (`packages/blueprint/tests/fixtures/large.blueprint.json`, 40 entities).
 * Samples, medians and machine details go to tmp/bench-player-<timestamp>.json.
 * The bench is report-only: there is no budget until the lead sets one.
 *
 *   pnpm --filter @protoyard/player build
 *   pnpm exec tsx scripts/bench-player.ts [--runs 3] [--blueprints crm,clinic] [--no-large]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
import {
  blueprintShareFragment,
  encodeBlueprintShare,
  parseBlueprint,
  ShareLinkTooLargeError,
} from '../packages/blueprint/src/index.ts';
import { serveStatic } from '../packages/cli/src/lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'packages/player/dist');
const LARGE = join(ROOT, 'packages/blueprint/tests/fixtures/large.blueprint.json');
const DEFAULT_BLUEPRINTS = ['crm', 'clinic', 'logistics', 'lms', 'project-management'];
const READY_TIMEOUT_MS = 60_000;

interface Visit {
  /** ms from navigation start to `protoyard:ready`. */
  readyMs: number;
  /** ms from navigation start to `protoyard:world-ready`. */
  worldReadyMs: number;
  /** Whether this visit generated the world (from the mark's detail). */
  seeded: boolean | null;
}

interface Switch {
  /** ms the `scenarios.load()` call took in the page. */
  loadMs: number;
  /** The runtime's generate phase for that load. */
  generateMs: number | null;
  /** World-generation workers started during the load (0 on a cache hit). */
  workersStarted: number;
}

interface Stats {
  median: number;
  min: number;
  max: number;
}

interface BlueprintResult {
  name: string;
  source: 'share-link' | 'src';
  /** Characters after `#bp=`, or null when the blueprint is too large for a link. */
  linkLength: number | null;
  entities: number;
  runs: number;
  firstVisit: { ready: Stats; worldReady: Stats; samples: Visit[] };
  repeatVisit: { ready: Stats; samples: Visit[] };
  switchMiss: { load: Stats; samples: Switch[] };
  switchHit: { load: Stats; samples: Switch[] };
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parseArgs(argv: string[]): { runs: number; blueprints: string[]; large: boolean } {
  let runs = 3;
  let blueprints = DEFAULT_BLUEPRINTS;
  let large = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--runs') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail('--runs needs a positive integer.');
      runs = value;
    } else if (arg === '--blueprints') {
      blueprints = String(argv[++i] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      for (const name of blueprints) {
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) fail(`Invalid blueprint "${name}".`);
      }
    } else if (arg === '--no-large') large = false;
    else fail(`Unknown option ${arg}.`);
  }
  return { runs, blueprints, large };
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

/** Counts world-generation workers the page starts (a cache hit starts none). */
function countWorkers() {
  const native = window.Worker;
  (window as unknown as { __benchWorkers: number }).__benchWorkers = 0;
  window.Worker = class extends native {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      if (String(url).includes('generate.worker')) {
        (window as unknown as { __benchWorkers: number }).__benchWorkers += 1;
      }
    }
  };
}

async function readMarks(page: Page): Promise<Visit> {
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

async function switchScenario(page: Page, scenarioId: string): Promise<Switch> {
  return page.evaluate(async (id) => {
    const scope = window as unknown as {
      __benchWorkers: number;
      __protoyard: {
        scenarios: {
          load(id: string): Promise<unknown>;
          lastLoadTimings?: () => { generateMs: number } | null;
        };
      };
    };
    const before = scope.__benchWorkers;
    const started = performance.now();
    await scope.__protoyard.scenarios.load(id);
    const loadMs = performance.now() - started;
    return {
      loadMs,
      generateMs: scope.__protoyard.scenarios.lastLoadTimings?.()?.generateMs ?? null,
      workersStarted: scope.__benchWorkers - before,
    };
  }, scenarioId);
}

async function benchBlueprint(
  browser: Browser,
  baseUrl: string,
  entry: {
    name: string;
    url: string;
    source: BlueprintResult['source'];
    linkLength: number | null;
    entities: number;
  },
  runs: number
): Promise<BlueprintResult> {
  const first: Visit[] = [];
  const repeat: Visit[] = [];
  const miss: Switch[] = [];
  const hit: Switch[] = [];
  for (let run = 0; run < runs; run++) {
    // A fresh context per run: empty IndexedDB (including the world cache) and HTTP cache.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      await context.addInitScript(countWorkers);
      const page = await context.newPage();
      page.on('pageerror', (error) =>
        console.error(`  ! ${entry.name}: page error: ${error.message}`)
      );
      await page.goto(`${baseUrl}${entry.url}`, { waitUntil: 'commit' });
      first.push(await readMarks(page));
      await page.reload({ waitUntil: 'commit' });
      repeat.push(await readMarks(page));
      miss.push(await switchScenario(page, 'empty'));
      hit.push(await switchScenario(page, 'active'));
    } finally {
      await context.close();
    }
  }
  if (first.some((v) => v.seeded === false) || repeat.some((v) => v.seeded === true)) {
    console.error(
      `  ! ${entry.name}: a first visit reused a world or a repeat visit regenerated one.`
    );
  }
  if (hit.some((s) => s.workersStarted > 0)) {
    console.error(`  ! ${entry.name}: a cache-hit switch started a generation worker.`);
  }
  return {
    name: entry.name,
    source: entry.source,
    linkLength: entry.linkLength,
    entities: entry.entities,
    runs,
    firstVisit: {
      ready: stats(first.map((v) => v.readyMs)),
      worldReady: stats(first.map((v) => v.worldReadyMs)),
      samples: first,
    },
    repeatVisit: { ready: stats(repeat.map((v) => v.readyMs)), samples: repeat },
    switchMiss: { load: stats(miss.map((s) => s.loadMs)), samples: miss },
    switchHit: { load: stats(hit.map((s) => s.loadMs)), samples: hit },
  };
}

async function main() {
  const { runs, blueprints, large } = parseArgs(process.argv.slice(2));
  if (!existsSync(join(DIST, 'index.html'))) {
    fail('No player build. Run `pnpm --filter @protoyard/player build` first.');
  }

  // Serve a copy of the build with the blueprints next to it, for `?src=` loading.
  const served = join(ROOT, 'tmp', 'bench-player-serve');
  rmSync(served, { recursive: true, force: true });
  cpSync(DIST, served, { recursive: true });
  mkdirSync(join(served, 'bench-blueprints'), { recursive: true });

  const files = [
    ...blueprints.map((name) => ({ name, file: join(ROOT, 'blueprints', `${name}.json`) })),
    ...(large ? [{ name: 'large-fixture', file: LARGE }] : []),
  ];
  const entries = [];
  for (const { name, file } of files) {
    if (!existsSync(file)) fail(`No blueprint at ${file}.`);
    const text = readFileSync(file, 'utf8');
    const blueprint = parseBlueprint(JSON.parse(text));
    writeFileSync(join(served, 'bench-blueprints', `${name}.json`), text);
    try {
      const encoded = await encodeBlueprintShare(blueprint);
      entries.push({
        name,
        url: blueprintShareFragment(encoded),
        source: 'share-link' as const,
        linkLength: encoded.length,
        entities: blueprint.entities.length,
      });
    } catch (error) {
      if (!(error instanceof ShareLinkTooLargeError)) throw error;
      entries.push({
        name,
        url: `?src=./bench-blueprints/${name}.json`,
        source: 'src' as const,
        linkLength: null,
        entities: blueprint.entities.length,
      });
    }
  }

  const server = await serveStatic({
    dir: served,
    base: '/',
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
  });
  const browser = await chromium.launch();
  const cpu = cpus()[0];
  const machine = {
    cpu: cpu?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()} (${arch()})`,
    node: process.version,
    chromium: browser.version(),
  };
  console.log(
    `Player, median of ${runs} fresh contexts · ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGb} GB · ${machine.os} · Node ${machine.node} · Chromium ${machine.chromium}`
  );
  const results: BlueprintResult[] = [];
  try {
    for (const entry of entries) {
      const result = await benchBlueprint(browser, server.url, entry, runs);
      results.push(result);
      console.log(
        `  ${entry.name.padEnd(20)} ${result.source === 'share-link' ? `#bp= ${result.linkLength} chars` : '?src= (too large for a link)'}` +
          ` · first visit ${result.firstVisit.ready.median} ms (world ${result.firstVisit.worldReady.median} ms)` +
          ` · repeat ${result.repeatVisit.ready.median} ms` +
          ` · switch miss ${result.switchMiss.load.median} ms · cache hit ${result.switchHit.load.median} ms`
      );
    }
  } finally {
    await browser.close();
    await server.close();
    rmSync(served, { recursive: true, force: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(ROOT, 'tmp', `bench-player-${stamp}.json`);
  writeFileSync(
    out,
    `${JSON.stringify({ format: 'protoyard.bench-player', version: 1, measuredAt: new Date().toISOString(), runs, machine, budget: null, results }, null, 2)}\n`
  );
  console.log(`Wrote ${out}`);
  console.log('Report only: no player budget is set yet.');
}

await main();
