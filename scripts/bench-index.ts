/**
 * Scale benchmark for discovery + indexing (`pnpm bench:index`).
 *
 * Generates N synthetic protoyard.json manifests (default 1,000) in a temp
 * workspace — never committed — and measures, with real timers:
 *   1. cold index (no cache), 2. warm index (cache hit, stat only),
 *   3. incremental index after touching 1% of manifests,
 *   4. registry filtering/search, 5. end-to-end `protoyard list --json`
 *      (process start included), and optionally 6. a static gallery build
 *      rendering every entry (--gallery).
 *
 * Results are printed and written to tmp/bench-index-<timestamp>.json.
 *
 *   pnpm bench:index [--count 1000] [--runs 5] [--gallery] [--keep] [--check [--ci-factor 3]]
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
import { createRng } from '../packages/core/src/index.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : Number(process.argv[i + 1]);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
const COUNT = arg('count', 1000);
const RUNS = arg('runs', 5);
const WITH_GALLERY = process.argv.includes('--gallery');
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

const CATEGORIES = ['sales', 'fintech', 'ai', 'health', 'education', 'ops', 'marketing', 'support'];
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
    if (WITH_GALLERY) {
      console.log('Building the gallery against the synthetic registry…');
      const outDir = join(root, 'gallery-dist');
      const started = performance.now();
      const result = spawnSync(
        process.execPath,
        [join(ROOT, 'apps/gallery/node_modules/astro/bin/astro.mjs'), 'build', '--outDir', outDir],
        {
          cwd: join(ROOT, 'apps/gallery'),
          env: { ...process.env, PROTOYARD_REGISTRY: paths.registry },
          encoding: 'utf8',
        }
      );
      const pages = (result.stdout.match(/index\.html/g) ?? []).length;
      gallery = { ms: Math.round(performance.now() - started), ok: result.status === 0, pages };
      if (!gallery.ok) console.error(result.stderr.slice(-2000));
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
      check:
        budgetMs === null
          ? null
          : {
              indexColdMs: budgetMs,
              ciFactor: CI_FACTOR,
              thresholdMs: Math.round(budgetMs * CI_FACTOR * 100) / 100,
              coldOk: stats(cold).medianMs <= budgetMs * CI_FACTOR,
              incrementalOk: stats(incremental).medianMs <= budgetMs * CI_FACTOR,
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
    ];
    console.log('');
    for (const [label, value] of rows) console.log(`${label.padEnd(40)} ${value}`);

    mkdirSync(join(ROOT, 'tmp'), { recursive: true });
    const file = join(ROOT, 'tmp', `bench-index-${result.measuredAt.replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nWrote ${file}`);
    if (!cliOk || (gallery && !gallery.ok)) process.exitCode = 1;
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
    }
  } finally {
    if (KEEP) console.log(`Kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }
}

await main();
