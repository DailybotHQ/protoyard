/**
 * End-to-end benchmark for the offline brief → running prototype flow.
 *
 * Each run measures two isolated workspaces under tmp/: generation with its
 * normal offline workspace install, and `--no-install` after dependencies are
 * linked in a separate setup step. Both synthesize and validate a fixture
 * brief, generate and build a prototype, then serve the static build on an
 * OS-assigned port. The final phase ends at Protoyard's `protoyard:ready` mark
 * after a fresh browser context has seeded its first world. Samples and
 * machine details are written to tmp/bench-idea-<timestamp>.json.
 *
 *   pnpm exec tsx scripts/bench-idea.ts [--mode idea|quick] [--runs 3] [--check] [--ci-factor 3]
 *
 * `--mode quick` measures `protoyard quick` instead, with no build: brief →
 * blueprint → ready exploration folder (the CLI), then the launcher opened in
 * a fresh browser context until `protoyard:ready` with a seeded world. Each
 * run uses its own workspace holding a copy of the prebuilt player (built
 * once in setup, outside the timings), so the first exploration copies the
 * player; a second, warm exploration in the same workspace reuses it. It also
 * opens every `blueprints/quick/*.json` example through `quick --blueprint`
 * and records the JavaScript loaded until ready. Results go to
 * tmp/bench-quick-<timestamp>.json; `quickReadyMs` is the budget key.
 *
 * Null budgets are report-only. CI multiplies configured thresholds by the
 * selected factor, matching the other local performance benches.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { loadBudgets, type PerformanceBudget } from '../packages/cli/src/lib/budgets.ts';
import { createPlayerAssetsManifest } from '../packages/cli/src/lib/quick/player-assets.ts';
import { serveStatic } from '../packages/cli/src/lib/static-server.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMPLATE = join(ROOT, 'templates', 'crud-app');
const READY_TIMEOUT_MS = 30_000;
const BRIEF = `A fictional field service team needs to schedule equipment inspections, assign technicians, and track each visit from planned through complete. Managers need a dashboard and a calendar. Each inspection has a site, due date, status, and notes.`;

const PHASES = [
  'briefToBlueprint',
  'blueprintValidation',
  'prototypeGeneration',
  'prototypeBuild',
  'previewReady',
] as const;
type Phase = (typeof PHASES)[number];
type PhaseBudget =
  | 'briefToBlueprintMs'
  | 'blueprintValidationMs'
  | 'prototypeGenerationMs'
  | 'prototypeBuildMs'
  | 'previewReadyMs';
const PHASE_BUDGETS: Record<Phase, PhaseBudget> = {
  briefToBlueprint: 'briefToBlueprintMs',
  blueprintValidation: 'blueprintValidationMs',
  prototypeGeneration: 'prototypeGenerationMs',
  prototypeBuild: 'prototypeBuildMs',
  previewReady: 'previewReadyMs',
};

interface Stats {
  median: number;
  min: number;
  max: number;
}

interface Sample {
  run: number;
  slug: string;
  installMode: 'install' | 'no-install';
  phasesMs: Record<Phase, number>;
  ideaToRunningMs: number;
  firstWorldSeeded: boolean;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let runs = 3;
  let check = false;
  let ciFactor = 3;
  let mode: 'idea' | 'quick' = 'idea';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') check = true;
    else if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'idea' && value !== 'quick') fail('--mode takes idea or quick.');
      mode = value;
    } else if (arg === '--runs' || arg === '--ci-factor') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail(`${arg} needs a positive integer.`);
      if (arg === '--runs') runs = value;
      else ciFactor = value;
    } else
      fail(
        `Unknown option ${arg}. Usage: tsx scripts/bench-idea.ts [--mode idea|quick] [--runs 3] [--check] [--ci-factor 3]`
      );
  }
  return { runs, check, ciFactor, mode };
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    median: round(median),
    min: round(sorted[0] as number),
    max: round(sorted[sorted.length - 1] as number),
  };
}

function command(workspace: string, args: string[]): string {
  const run = spawnSync(
    join(ROOT, 'node_modules', '.bin', 'tsx'),
    [join(ROOT, 'packages', 'cli', 'src', 'bin.ts'), '--root', workspace, '--json', ...args],
    {
      cwd: workspace,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  if (run.error || run.status !== 0) {
    throw new Error(
      `pnpm protoyard ${args.join(' ')} failed (${run.status ?? 'spawn error'}):\n${run.stderr}${run.stdout}${run.error?.message ?? ''}`
    );
  }
  try {
    return run.stdout;
  } catch (error) {
    throw new Error(`Could not read CLI output: ${String(error)}`);
  }
}

function commandData<T>(stdout: string): T {
  const envelope = JSON.parse(stdout) as { data?: T; error?: { message?: string } };
  if (!envelope.data) throw new Error(envelope.error?.message ?? 'CLI returned no data.');
  return envelope.data;
}

function makeWorkspace(): string {
  const workspace = mkdtempSync(join(ROOT, 'tmp', 'bench-idea-workspace-'));
  mkdirSync(join(workspace, 'prototypes'), { recursive: true });
  mkdirSync(join(workspace, 'templates'), { recursive: true });
  mkdirSync(join(workspace, 'tmp'), { recursive: true });
  writeFileSync(
    join(workspace, 'package.json'),
    '{"name":"protoyard-idea-bench","private":true}\n'
  );
  writeFileSync(
    join(workspace, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n  - prototypes/*\n  - templates/*\n'
  );
  symlinkSync(join(ROOT, 'packages'), join(workspace, 'packages'), 'dir');
  symlinkSync(join(ROOT, 'tsconfig.base.json'), join(workspace, 'tsconfig.base.json'));
  cpSync(TEMPLATE, join(workspace, 'templates', 'crud-app'), {
    recursive: true,
    filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
  });
  return workspace;
}

function installOffline(workspace: string) {
  const run = spawnSync('pnpm', ['install', '--offline'], {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) {
    throw new Error(
      `pnpm install --offline failed in benchmark workspace:\n${run.stderr}${run.stdout}`
    );
  }
}

async function previewReady(workspace: string, slug: string): Promise<boolean> {
  const manifestPath = join(workspace, 'artifacts', slug, 'build-manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Build manifest missing for ${slug}.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { base: string };
  const server = await serveStatic({
    dir: join(workspace, 'artifacts', slug, 'dist'),
    base: manifest.base,
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: 'commit' });
      await page.waitForSelector('html[data-protoyard-ready="1"]', {
        state: 'attached',
        timeout: READY_TIMEOUT_MS,
      });
      return await page.evaluate(() => {
        const world = performance.getEntriesByName('protoyard:world-ready', 'mark')[0] as
          | PerformanceMark
          | undefined;
        const detail = world?.detail as { seeded?: unknown } | null | undefined;
        return detail?.seeded === true;
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function measureRun(
  workspace: string,
  run: number,
  installMode: Sample['installMode']
): Promise<Sample> {
  if (installMode === 'no-install') installOffline(workspace);
  const slug = `idea-bench-${process.pid}-${run}-${installMode === 'install' ? 'with' : 'without'}-install`;
  const blueprintPath = join(workspace, 'tmp', `${slug}.json`);
  const briefPath = join(workspace, 'tmp', `${slug}.md`);
  writeFileSync(briefPath, `${BRIEF}\n`);
  const started = performance.now();
  const phasesMs = {} as Record<Phase, number>;

  let phaseStart = performance.now();
  command(workspace, ['blueprint', 'new', blueprintPath, '--from-brief', briefPath]);
  phasesMs.briefToBlueprint = performance.now() - phaseStart;

  phaseStart = performance.now();
  command(workspace, ['blueprint', 'validate', blueprintPath]);
  phasesMs.blueprintValidation = performance.now() - phaseStart;

  phaseStart = performance.now();
  const generateArgs = ['generate', slug, '--blueprint', blueprintPath];
  if (installMode === 'no-install') generateArgs.push('--no-install');
  const generated = commandData<{
    durationMs?: number;
    install?: { mode?: string; skipped?: boolean };
  }>(command(workspace, generateArgs));
  phasesMs.prototypeGeneration = performance.now() - phaseStart;
  if (installMode === 'install' && generated.install?.mode !== 'offline') {
    throw new Error(`${slug} did not use the offline workspace install.`);
  }
  if (installMode === 'no-install') {
    if (generated.install?.skipped !== true)
      throw new Error(`${slug} did not skip the workspace install as requested.`);
    cpSync(
      join(workspace, 'templates', 'crud-app', 'node_modules'),
      join(workspace, 'prototypes', slug, 'node_modules'),
      { recursive: true }
    );
  }

  phaseStart = performance.now();
  command(workspace, ['build', slug]);
  phasesMs.prototypeBuild = performance.now() - phaseStart;

  phaseStart = performance.now();
  const firstWorldSeeded = await previewReady(workspace, slug);
  phasesMs.previewReady = performance.now() - phaseStart;
  if (!firstWorldSeeded) throw new Error(`${slug} reached ready without seeding its first world.`);

  const ideaToRunningMs = performance.now() - started;
  if (generated.durationMs === undefined)
    throw new Error(`${slug} generate output omitted durationMs.`);
  return {
    run,
    slug,
    installMode,
    phasesMs: Object.fromEntries(
      PHASES.map((phase) => [phase, Math.round(phasesMs[phase])])
    ) as Record<Phase, number>,
    ideaToRunningMs: Math.round(ideaToRunningMs),
    firstWorldSeeded,
  };
}

// ── --mode quick ────────────────────────────────────────────────────────────

const QUICK_PHASES = ['quickFolderReady', 'previewReady'] as const;
type QuickPhase = (typeof QUICK_PHASES)[number];

interface QuickSample {
  run: number;
  slug: string;
  phasesMs: Record<QuickPhase, number>;
  quickReadyMs: number;
  /** A second exploration in the same workspace, reusing the shared player. */
  warmFolderReadyMs: number;
  playerFiles: number;
  firstWorldSeeded: boolean;
}

interface ExampleSample {
  example: string;
  archetype: string | null;
  readyMs: number;
  jsFiles: number;
  jsRawKb: number;
  jsGzipKb: number;
  /** The five largest scripts loaded before ready (gzip KB), to see what dominates. */
  largest: { file: string; gzipKb: number }[];
}

/** The player's initial JavaScript: the entry plus its modulepreloads, gzip KB (same for every blueprint). */
function playerInitialJsGzipKb(dist: string): { files: number; gzipKb: number } {
  const app = join(dist, 'app');
  const html = readFileSync(join(app, 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map(
    (match) => match[1] as string
  );
  const bytes = files.reduce(
    (sum, file) => sum + gzipSync(readFileSync(join(app, file)), { level: 9 }).byteLength,
    0
  );
  return { files: files.length, gzipKb: Math.round((bytes / 1024) * 10) / 10 };
}

const PLAYER_MANIFEST = 'protoyard-player-assets.json';

/** Builds the player once when it has no app build (setup, outside every timing). */
function ensurePlayerBuild(): string {
  const dist = join(ROOT, 'packages', 'player', 'dist');
  if (!existsSync(join(dist, 'app', 'index.html'))) {
    console.log('  setup: building @protoyard/player (once, not timed)');
    const run = spawnSync('pnpm', ['--filter', '@protoyard/player', 'build'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) throw new Error(`player build failed:\n${run.stderr}${run.stdout}`);
  }
  return dist;
}

/**
 * A workspace with its own copy of the prebuilt player (dist/app and the asset
 * manifest its build ships), so `quick` finds it as this repository's player.
 * A build without the manifest gets one in the copy, never in packages/player.
 */
async function makeQuickWorkspace(dist: string): Promise<{ workspace: string; files: number }> {
  const workspace = mkdtempSync(join(ROOT, 'tmp', 'bench-quick-workspace-'));
  writeFileSync(
    join(workspace, 'package.json'),
    '{"name":"protoyard-quick-bench","private":true}\n'
  );
  writeFileSync(join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  const player = join(workspace, 'packages', 'player');
  mkdirSync(player, { recursive: true });
  cpSync(join(ROOT, 'packages', 'player', 'package.json'), join(player, 'package.json'));
  cpSync(dist, join(player, 'dist'), { recursive: true });
  const version = (
    JSON.parse(readFileSync(join(player, 'package.json'), 'utf8')) as { version: string }
  ).version;
  const app = join(player, 'dist', 'app');
  const manifest = existsSync(join(app, PLAYER_MANIFEST))
    ? (JSON.parse(readFileSync(join(app, PLAYER_MANIFEST), 'utf8')) as { files: unknown[] })
    : await createPlayerAssetsManifest(app, version);
  return { workspace, files: manifest.files.length };
}

/** Opens an exploration's launcher in a fresh context; resolves at `protoyard:ready`. */
async function openLauncher(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  workspace: string,
  slug: string
): Promise<{ seeded: boolean; readyMs: number; js: { url: string; raw: number; gzip: number }[] }> {
  const server = await serveStatic({
    dir: join(workspace, '.protoyard', 'quick'),
    base: '/',
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
    spa: false,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const js: { url: string; raw: number; gzip: number }[] = [];
  try {
    const page = await context.newPage();
    page.on('response', async (response) => {
      if (!response.url().endsWith('.js')) return;
      const body = await response.body().catch(() => null);
      if (body)
        js.push({
          url: response.url(),
          raw: body.byteLength,
          gzip: gzipSync(body, { level: 9 }).byteLength,
        });
    });
    const started = performance.now();
    await page.goto(`${server.url}${slug}/index.html`, { waitUntil: 'commit' });
    await page.waitForSelector('html[data-protoyard-ready="1"]', {
      state: 'attached',
      timeout: READY_TIMEOUT_MS * 2,
    });
    const readyMs = performance.now() - started;
    const seeded = await page.evaluate(() => {
      const world = performance.getEntriesByName('protoyard:world-ready', 'mark')[0] as
        | PerformanceMark
        | undefined;
      return (world?.detail as { seeded?: unknown } | null | undefined)?.seeded === true;
    });
    return { seeded, readyMs, js };
  } finally {
    await context.close();
    await server.close();
  }
}

async function measureQuickRun(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  dist: string,
  run: number
): Promise<QuickSample> {
  const { workspace, files } = await makeQuickWorkspace(dist);
  try {
    const slug = `quick-bench-${run}`;
    const started = performance.now();
    const data = commandData<{ ready: boolean; player: { reused: boolean } }>(
      command(workspace, ['quick', BRIEF, '--slug', slug])
    );
    const folderMs = performance.now() - started;
    if (!data.ready || data.player.reused)
      throw new Error(`${slug}: expected a ready folder with a fresh player copy.`);
    const opened = await openLauncher(browser, workspace, slug);
    if (!opened.seeded) throw new Error(`${slug} reached ready without seeding its first world.`);
    const total = performance.now() - started;

    const warmStarted = performance.now();
    const warm = commandData<{ player: { reused: boolean } }>(
      command(workspace, ['quick', BRIEF, '--slug', `${slug}-warm`])
    );
    const warmMs = performance.now() - warmStarted;
    if (!warm.player.reused) throw new Error(`${slug}-warm did not reuse the shared player.`);
    return {
      run,
      slug,
      phasesMs: {
        quickFolderReady: Math.round(folderMs),
        previewReady: Math.round(opened.readyMs),
      },
      quickReadyMs: Math.round(total),
      warmFolderReadyMs: Math.round(warmMs),
      playerFiles: files,
      firstWorldSeeded: opened.seeded,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** Every blueprints/quick example through `quick --blueprint`, with the JavaScript it loads until ready. */
async function measureExamples(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  dist: string
): Promise<ExampleSample[]> {
  const { workspace } = await makeQuickWorkspace(dist);
  try {
    const dir = join(ROOT, 'blueprints', 'quick');
    const examples = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    const out: ExampleSample[] = [];
    for (const file of examples) {
      const example = basename(file, '.json');
      const blueprint = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        archetype?: { id?: string };
      };
      command(workspace, ['quick', '--blueprint', join(dir, file), '--slug', `example-${example}`]);
      const opened = await openLauncher(browser, workspace, `example-${example}`);
      const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;
      out.push({
        example,
        archetype: blueprint.archetype?.id ?? null,
        readyMs: Math.round(opened.readyMs),
        jsFiles: opened.js.length,
        jsRawKb: kb(opened.js.reduce((sum, file) => sum + file.raw, 0)),
        jsGzipKb: kb(opened.js.reduce((sum, file) => sum + file.gzip, 0)),
        largest: [...opened.js]
          .sort((a, b) => b.gzip - a.gzip)
          .slice(0, 5)
          .map((file) => ({ file: file.url.split('/').pop() ?? file.url, gzipKb: kb(file.gzip) })),
      });
    }
    return out;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function quickMain(options: {
  runs: number;
  check: boolean;
  ciFactor: number;
  machine: Record<string, unknown>;
  budgets: PerformanceBudget;
}) {
  const { runs, check, ciFactor, machine, budgets } = options;
  console.log(
    `Brief → ready quick exploration, ${runs} isolated runs · ${machine.cpu} · ${machine.os} · Node ${machine.node} · Chromium ${machine.chromium}`
  );
  const dist = ensurePlayerBuild();
  const samples: QuickSample[] = [];
  let examples: ExampleSample[] = [];
  const browser = await chromium.launch();
  try {
    for (let run = 1; run <= runs; run++) samples.push(await measureQuickRun(browser, dist, run));
    examples = await measureExamples(browser, dist);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  } finally {
    await browser.close();
  }

  const summary = {
    quickReadyMs: stats(samples.map((sample) => sample.quickReadyMs)),
    phasesMs: Object.fromEntries(
      QUICK_PHASES.map((phase) => [phase, stats(samples.map((sample) => sample.phasesMs[phase]))])
    ) as Record<QuickPhase, Stats>,
    warmFolderReadyMs: stats(samples.map((sample) => sample.warmFolderReadyMs)),
  };
  for (const phase of QUICK_PHASES)
    console.log(`  ${phase.padEnd(20)} ${summary.phasesMs[phase].median} ms median`);
  console.log(
    `  brief → ready        ${summary.quickReadyMs.median} ms median (${summary.quickReadyMs.min}–${summary.quickReadyMs.max} ms)`
  );
  console.log(`  warm folder (shared player reused) ${summary.warmFolderReadyMs.median} ms median`);
  const initial = playerInitialJsGzipKb(dist);
  console.log(
    `  player initial JS    ${initial.gzipKb} KB gzip (${initial.files} files, the same for every blueprint)`
  );
  for (const example of examples) {
    console.log(
      `  example ${example.example.padEnd(16)} ${String(example.jsGzipKb).padStart(6)} KB gzip JS to ready (${example.jsFiles} files), ${example.readyMs} ms; largest: ${example.largest
        .slice(0, 3)
        .map((file) => `${file.file} ${file.gzipKb} KB`)
        .join(', ')}`
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const out = join(ROOT, 'tmp', `bench-quick-${stamp}.json`);
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        format: 'protoyard.bench-quick',
        version: 1,
        measuredAt: new Date().toISOString(),
        runs,
        machine,
        ...summary,
        playerInitialJs: playerInitialJsGzipKb(dist),
        examples,
        budgets: { quickReadyMs: budgets.quickReadyMs },
        samples,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${out}`);

  if (!check) return;
  const factor = process.env.CI ? ciFactor : 1;
  if (budgets.quickReadyMs === null) {
    console.log('quickReadyMs is not calibrated: reported only, not gated.');
  } else if (summary.quickReadyMs.median > budgets.quickReadyMs * factor) {
    console.error(
      `✗ quickReadyMs ${summary.quickReadyMs.median} > ${budgets.quickReadyMs * factor}.`
    );
    process.exitCode = 1;
  } else {
    console.log(`✓ Quick-ready check passed${factor > 1 ? ` (CI factor ${factor})` : ''}.`);
  }
}

async function main() {
  const { runs, check, ciFactor, mode } = parseArgs(process.argv.slice(2));
  const budgets = (await loadBudgets(ROOT)).defaults;
  const cpu = cpus();
  let browserVersion = 'not launched';
  try {
    const probe = await chromium.launch();
    browserVersion = probe.version();
    await probe.close();
  } catch (error) {
    fail(
      `Could not start headless Chromium (${error instanceof Error ? error.message.split('\n')[0] : String(error)}). Run \`pnpm test:e2e:install\` once.`
    );
  }
  const machine = {
    cpu: cpu[0]?.model.trim() ?? 'unknown',
    cores: cpu.length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()} (${arch()})`,
    node: process.versions.node,
    chromium: browserVersion,
  };
  if (mode === 'quick') {
    await quickMain({ runs, check, ciFactor, machine, budgets });
    return;
  }
  const samples: Sample[] = [];
  console.log(
    `Idea → running prototype, ${runs} isolated runs for each install mode · ${machine.cpu} · ${machine.os} · Node ${machine.node} · Chromium ${machine.chromium}`
  );
  try {
    for (let run = 1; run <= runs; run++) {
      for (const installMode of ['install', 'no-install'] as const) {
        const workspace = makeWorkspace();
        try {
          samples.push(await measureRun(workspace, run, installMode));
        } finally {
          rmSync(workspace, { recursive: true, force: true });
        }
      }
    }
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const byMode = Object.fromEntries(
    (['install', 'no-install'] as const).map((installMode) => {
      const modeSamples = samples.filter((sample) => sample.installMode === installMode);
      const phaseMedians = Object.fromEntries(
        PHASES.map((phase) => [phase, stats(modeSamples.map((sample) => sample.phasesMs[phase]))])
      ) as Record<Phase, Stats>;
      return [
        installMode,
        {
          ideaToRunningMs: stats(modeSamples.map((sample) => sample.ideaToRunningMs)),
          phasesMs: phaseMedians,
        },
      ];
    })
  ) as Record<Sample['installMode'], { ideaToRunningMs: Stats; phasesMs: Record<Phase, Stats> }>;
  for (const installMode of ['install', 'no-install'] as const) {
    const mode = byMode[installMode];
    console.log(`  ${installMode} mode:`);
    for (const phase of PHASES)
      console.log(`    ${phase.padEnd(23)} ${mode.phasesMs[phase].median} ms median`);
    console.log(
      `    idea → running          ${mode.ideaToRunningMs.median} ms median (${mode.ideaToRunningMs.min}–${mode.ideaToRunningMs.max} ms)`
    );
  }

  const results = {
    modes: byMode,
    budgets: {
      ideaToRunningMs: budgets.ideaToRunningMs,
      phasesMs: Object.fromEntries(PHASES.map((phase) => [phase, budgets[PHASE_BUDGETS[phase]]])),
    },
    samples,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(join(ROOT, 'tmp'), { recursive: true });
  const out = join(ROOT, 'tmp', `bench-idea-${stamp}.json`);
  writeFileSync(
    out,
    `${JSON.stringify({ format: 'protoyard.bench-idea', version: 1, measuredAt: new Date().toISOString(), runs, machine, ...results }, null, 2)}\n`
  );
  console.log(`Wrote ${out}`);

  if (!check) return;
  const factor = process.env.CI ? ciFactor : 1;
  const over: string[] = [];
  const totalBudget = budgets.ideaToRunningMs;
  if (totalBudget === null)
    console.log('ideaToRunningMs is not calibrated: reported only, not gated.');
  else if (byMode.install.ideaToRunningMs.median > totalBudget * factor)
    over.push(`ideaToRunningMs ${byMode.install.ideaToRunningMs.median} > ${totalBudget * factor}`);
  for (const phase of PHASES) {
    const budget = budgets[PHASE_BUDGETS[phase]];
    if (budget !== null && byMode.install.phasesMs[phase].median > budget * factor)
      over.push(
        `${PHASE_BUDGETS[phase]} ${byMode.install.phasesMs[phase].median} > ${budget * factor}`
      );
  }
  if (over.length > 0) {
    console.error(`✗ Idea-to-running budget exceeded: ${over.join('; ')}.`);
    process.exitCode = 1;
  } else
    console.log(`✓ Idea-to-running check passed${factor > 1 ? ` (CI factor ${factor})` : ''}.`);
}

await main();
