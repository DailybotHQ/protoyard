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
 *   pnpm exec tsx scripts/bench-idea.ts [--runs 3] [--check] [--ci-factor 3]
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
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadBudgets } from '../packages/cli/src/lib/budgets.ts';
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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') check = true;
    else if (arg === '--runs' || arg === '--ci-factor') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) fail(`${arg} needs a positive integer.`);
      if (arg === '--runs') runs = value;
      else ciFactor = value;
    } else
      fail(
        `Unknown option ${arg}. Usage: tsx scripts/bench-idea.ts [--runs 3] [--check] [--ci-factor 3]`
      );
  }
  return { runs, check, ciFactor };
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

async function main() {
  const { runs, check, ciFactor } = parseArgs(process.argv.slice(2));
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
