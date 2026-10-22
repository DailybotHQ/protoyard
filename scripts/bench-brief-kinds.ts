/**
 * Benchmark for kind-aware brief synthesis (PLAN_005): representative app,
 * deck, page and doc briefs through the real dispatch (`blueprintFromBrief`:
 * kind detection, then the app archetype path or a content synthesizer).
 *
 * For each brief it reports the detected kind (and whether it matches the
 * expected one), the median / min / max time of one synthesis across runs
 * (each run is the median of `--iterations` calls after one warm-up call),
 * the output size (blueprint JSON, raw and gzip) and whether the output
 * validates through `safeParseAnyBlueprint`. It also checks that the deck
 * layout catalog stays out of the synthesizer's import graph and, when a
 * player build exists, out of the player's initial chunks, so authoring data
 * never inflates runtime entries.
 *
 * Report-only: there are no budgets until measured numbers justify them.
 * Results and machine details go to tmp/bench-brief-kinds-<timestamp>.json.
 *
 *   pnpm exec tsx scripts/bench-brief-kinds.ts [--runs 3] [--iterations 50] [--out <file>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BRIEF_ENTRY = join(ROOT, 'packages', 'blueprint', 'src', 'brief', 'index.ts');
const PLAYER_DIST = join(ROOT, 'packages', 'player', 'dist', 'app');
/** Modules that make up the deck layout catalog (authoring and rendering data). */
const LAYOUT_CATALOG = /packages\/decks\/src\/layouts\//;

type Kind = 'app' | 'deck' | 'page' | 'doc';

/** Fictional, representative briefs: two per kind, short and long. */
export const BRIEFS: readonly { id: string; expected: Kind; brief: string }[] = [
  {
    id: 'app-field-service',
    expected: 'app',
    brief:
      'A fictional field service team needs to schedule equipment inspections, assign technicians, and track each visit from planned through complete. Managers need a dashboard and a calendar. Each inspection has a site, due date, status, and notes.',
  },
  {
    id: 'app-clinic',
    expected: 'app',
    brief:
      'A small veterinary clinic tracks patients, owners and appointments. Staff book visits on a calendar, record treatments with costs, and see which invoices are unpaid.',
  },
  {
    id: 'deck-pitch',
    expected: 'deck',
    brief:
      'Create a 10-slide pitch deck for a fictional seed round: the problem, our solution, market size, traction, business model, team and the ask.',
  },
  {
    id: 'deck-qbr',
    expected: 'deck',
    brief:
      'A quarterly business review presentation for the leadership team: revenue versus plan, churn, top wins and losses, hiring, risks and priorities for next quarter. Include charts and a closing slide with decisions.',
  },
  {
    id: 'page-landing',
    expected: 'page',
    brief:
      'A landing page for a fictional note-taking app: a hero with a call to action, three feature highlights, customer quotes, pricing tiers and a sign-up form.',
  },
  {
    id: 'page-event',
    expected: 'page',
    brief:
      'A marketing page for a fictional design conference with the agenda, speakers, venue details, FAQ and a registration form.',
  },
  {
    id: 'doc-report',
    expected: 'doc',
    brief:
      'Write a one-page report on a fictional support team: summary, key metrics, what changed this month, open issues and recommendations.',
  },
  {
    id: 'doc-proposal',
    expected: 'doc',
    brief:
      'A project proposal document for migrating a fictional company to a new billing system: background, goals, scope, timeline, risks, costs and next steps.',
  },
];

interface Stats {
  median: number;
  min: number;
  max: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median needs a non-empty list.');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function stats(values: readonly number[]): Stats {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    median: round(median(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseArgs(argv: readonly string[]) {
  let runs = 3;
  let iterations = 50;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--runs' || arg === '--iterations') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 10_000) {
        throw new Error(`${arg} needs a whole number from 1 to 10000.`);
      }
      if (arg === '--runs') runs = value;
      else iterations = value;
    } else if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out needs a file path.');
      out = resolve(ROOT, value);
      if (relative(join(ROOT, 'tmp'), out).startsWith('..'))
        throw new Error('--out must be inside tmp/.');
    } else {
      throw new Error(
        `Unknown option ${arg}. Usage: tsx scripts/bench-brief-kinds.ts [--runs 3] [--iterations 50] [--out tmp/<file>.json]`
      );
    }
  }
  return { runs, iterations, out };
}

/** Every module reachable from `entry` through static relative imports, plus its bare imports. */
export function importGraph(entry: string): { local: string[]; external: string[] } {
  const local = new Set<string>();
  const external = new Set<string>();
  const visit = (file: string) => {
    if (local.has(file) || !existsSync(file)) return;
    local.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(
      /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm
    )) {
      if (!spec) continue;
      if (spec.startsWith('.')) visit(join(dirname(file), spec));
      else external.add(spec);
    }
  };
  visit(entry);
  return { local: [...local].map((f) => relative(ROOT, f)).sort(), external: [...external].sort() };
}

/** Whether the built player's initial chunks include the layout catalog (null without a build). */
function playerInitialHasLayoutCatalog(): boolean | null {
  const manifestPath = join(PLAYER_DIST, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    { isEntry?: boolean; imports?: string[] }
  >;
  const initial = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (initial.has(key) || !manifest[key]) continue;
    initial.add(key);
    queue.push(...(manifest[key].imports ?? []));
  }
  return [...initial].some((key) => LAYOUT_CATALOG.test(key));
}

async function main() {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const { runs, iterations, out } = options;
  const cpu = cpus();
  const machine = {
    cpu: cpu[0]?.model.trim() ?? 'unknown',
    cores: cpu.length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()} (${arch()})`,
    node: process.versions.node,
  };

  const loadStart = performance.now();
  const { blueprintFromBrief } = await import('../packages/blueprint/src/brief/index.ts');
  const { safeParseAnyBlueprint } = await import('../packages/blueprint/src/index.ts');
  const moduleLoadMs = Math.round((performance.now() - loadStart) * 10) / 10;

  console.log(
    `Kind-aware brief synthesis, ${runs} runs × ${iterations} iterations · ${machine.cpu} · ${machine.os} · Node ${machine.node}`
  );

  const results: {
    id: string;
    expected: Kind;
    detected: Kind;
    matches: boolean;
    outline: string | null;
    archetype: string | null;
    synthesisMs: ReturnType<typeof stats>;
    outputBytes: number;
    outputGzipBytes: number;
    validates: boolean;
    validationIssue: string | null;
  }[] = [];
  for (const { id, expected, brief } of BRIEFS) {
    const first = blueprintFromBrief(brief);
    const json = first.json as unknown;
    const text = JSON.stringify(json);
    const perRun: number[] = [];
    for (let run = 0; run < runs; run++) {
      blueprintFromBrief(brief); // warm-up
      const samples: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        blueprintFromBrief(brief);
        samples.push(performance.now() - start);
      }
      perRun.push(median(samples));
    }
    const validation = await safeParseAnyBlueprint(json);
    results.push({
      id,
      expected,
      detected: first.kind,
      matches: first.kind === expected,
      outline: 'outline' in first ? first.outline : null,
      archetype: 'archetype' in first ? first.archetype : null,
      synthesisMs: stats(perRun),
      outputBytes: Buffer.byteLength(text, 'utf8'),
      outputGzipBytes: gzipSync(text, { level: 9 }).length,
      validates: validation.success,
      validationIssue: validation.success
        ? null
        : `${validation.error.issues[0]?.path.join('.') || '(root)'}: ${validation.error.issues[0]?.message ?? ''}`,
    });
  }

  const byKind = Object.fromEntries(
    (['app', 'deck', 'page', 'doc'] as const).map((kind) => {
      const rows = results.filter((row) => row.expected === kind);
      return [
        kind,
        {
          briefs: rows.length,
          medianSynthesisMs:
            Math.round(median(rows.map((row) => row.synthesisMs.median)) * 1000) / 1000,
          maxOutputBytes: Math.max(...rows.map((row) => row.outputBytes)),
          allDetected: rows.every((row) => row.matches),
          allValidate: rows.every((row) => row.validates),
        },
      ];
    })
  );

  const graph = importGraph(BRIEF_ENTRY);
  const layoutCatalog = {
    inSynthesizerGraph:
      graph.local.some((file) => LAYOUT_CATALOG.test(file)) ||
      graph.external.some((spec) => spec.startsWith('@protoyard/decks')),
    inPlayerInitialChunks: playerInitialHasLayoutCatalog(),
    synthesizerModules: graph.local.length,
    synthesizerExternalImports: graph.external,
  };

  for (const row of results) {
    console.log(
      `${row.id.padEnd(20)} ${row.detected.padEnd(5)} ${row.matches ? 'ok ' : 'MISS'} ${String(row.synthesisMs.median).padStart(8)} ms  ${String(row.outputBytes).padStart(6)} B  ${row.validates ? 'valid' : `invalid (${row.validationIssue})`}`
    );
  }
  console.log(
    `Layout catalog in synthesizer graph: ${layoutCatalog.inSynthesizerGraph}; in player initial chunks: ${layoutCatalog.inPlayerInitialChunks ?? 'no player build (run pnpm --filter @protoyard/player build)'}`
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = out ?? join(ROOT, 'tmp', `bench-brief-kinds-${stamp}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        format: 'protoyard.bench-brief-kinds',
        version: 1,
        measuredAt: new Date().toISOString(),
        runs,
        iterations,
        machine,
        moduleLoadMs,
        budgets: null,
        byKind,
        layoutCatalog,
        results,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${relative(ROOT, file)} (report-only: no budgets yet).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
