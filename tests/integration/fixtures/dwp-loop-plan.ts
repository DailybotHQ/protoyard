import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerAssets } from '../../../packages/cli/src/lib/quick/player-assets.ts';
import { createPlayerAssetsManifest } from '../../../packages/cli/src/lib/quick/player-assets.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXPLORATION_TEMPLATE = join(
  REPO_ROOT,
  'integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md'
);
const BLUEPRINT_SOURCE = join(REPO_ROOT, 'blueprints/quick/analytics.json');
const SLUG = 'dwp-loop-fixture';
/** Prefix of every fixture workspace in the OS temp folder (leak checks look for it). */
export const DWP_LOOP_TEMP_PREFIX = 'protoyard-dwp-loop-';

export interface DwpLoopFixture {
  root: string;
  planDir: string;
  evidenceDir: string;
  explorationDir: string;
  rerunDir: string;
  blueprintPath: string;
  metricsPath: string;
  decisionPath: string;
  browserEvidencePath: string;
  player: PlayerAssets;
  cleanup(): void;
}

function fillExplorationTemplate(
  slug: string,
  variantCount: number,
  overrides: Record<string, string> = {}
): string {
  const source = readFileSync(EXPLORATION_TEMPLATE, 'utf8');
  const startMarker = '<!-- exploration-template:start -->';
  const endMarker = '<!-- exploration-template:end -->';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error('The exploration template markers are missing.');
  }
  const template = source.slice(start + startMarker.length, end).trim();
  const values: Record<string, string> = {
    TASK_TITLE: 'Compare the fixture exploration variants',
    IDEA: 'A fictional product analytics workspace for a small team.',
    DECISION_QUESTION: 'Which shell makes the fictional event explorer easiest to scan?',
    INPUT: 'input/analytics.json',
    SLUG: slug,
    SEED: '17',
    VARIANT_COUNT: String(variantCount),
    CRITERIA:
      '- The event explorer route is reachable.\n- The metrics route is reachable and records one local attempt.',
    SCRATCH_DIR: 'analysis_results/prototypes',
    PRIVATE_PORT: '4860',
    EVIDENCE_DIR: `analysis_results/prototypes/${slug}`,
    EVIDENCE: `- analysis_results/prototypes/${slug}/DECISION.md`,
    CHOSEN_VARIANT: 'v1',
    DECISION: 'iterate',
    FOLLOW_UP: 'Review the local evidence before any source-prototype work.',
    ...overrides,
  };
  const filled = template.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (match, key: string) => values[key] ?? match
  );
  if (/\{\{[A-Z_]+\}\}/.test(filled)) {
    throw new Error('The exploration fixture contains an unresolved placeholder.');
  }
  return `${filled}\n`;
}

async function fixturePlayer(root: string): Promise<PlayerAssets> {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  return {
    dir,
    packageDir: join(root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository',
  };
}

export interface DwpLoopFixtureOptions {
  /** Exploration slug (default `dwp-loop-fixture`). */
  slug?: string;
  /** The template's variant count (default 2). */
  variantCount?: number;
  /** Placeholder values that replace the defaults (hostile values in isolation tests). */
  values?: Record<string, string>;
  /** Temp-folder prefix (default {@link DWP_LOOP_TEMP_PREFIX}); a test file can use its own. */
  tempPrefix?: string;
}

/** Creates a disposable workspace and plan whose generated evidence is plan-scoped. */
export async function createDwpLoopFixture(
  options: DwpLoopFixtureOptions = {}
): Promise<DwpLoopFixture> {
  const slug = options.slug ?? SLUG;
  const root = mkdtempSync(join(tmpdir(), options.tempPrefix ?? DWP_LOOP_TEMP_PREFIX));
  const planDir = join(root, 'plan');
  const evidenceDir = join(planDir, 'analysis_results', 'prototypes');
  const explorationDir = join(evidenceDir, slug);
  const rerunDir = join(evidenceDir, `${slug}-rerun`);
  const inputDir = join(planDir, 'input');
  const blueprintPath = join(inputDir, 'analytics.json');
  const metricsPath = join(evidenceDir, 'validation-metrics.json');
  const decisionPath = join(explorationDir, 'DECISION.md');
  const browserEvidencePath = join(explorationDir, 'browser-evidence.json');

  mkdirSync(inputDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - prototypes/*\n  - templates/*\n'
  );
  writeFileSync(join(root, 'package.json'), '{"name":"dwp-loop-fixture","private":true}\n');
  mkdirSync(join(root, 'prototypes'), { recursive: true });
  mkdirSync(join(root, 'templates'), { recursive: true });
  cpSync(BLUEPRINT_SOURCE, blueprintPath);
  writeFileSync(
    join(planDir, 'exploration-task.md'),
    fillExplorationTemplate(slug, options.variantCount ?? 2, options.values)
  );

  return {
    root,
    planDir,
    evidenceDir,
    explorationDir,
    rerunDir,
    blueprintPath,
    metricsPath,
    decisionPath,
    browserEvidencePath,
    player: await fixturePlayer(root),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function writeBrowserSkip(path: string): void {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        kind: 'browser-evidence',
        status: 'skipped',
        reason: 'playwright-unavailable',
        note: 'The fixture validates local routes and metrics without presenting screenshots as evidence.',
      },
      null,
      2
    )}\n`
  );
}

export function writeDecision(path: string): void {
  writeFileSync(
    path,
    '# Fixture exploration decision\n\n- Observed evidence: local validation and metrics only.\n- Selected variant: v1\n- Decision: iterate\n- Evidence: analysis_results/prototypes/dwp-loop-fixture/report.json and analysis_results/prototypes/dwp-loop-fixture/REPORT.md\n- Follow-up: review the report before any explicit promotion task.\n- Promotion: not automatic.\n'
  );
}

/** A plan-relative path that would leave the plan's evidence scope. */
export class PlanScopeError extends Error {
  readonly requested: string;
  constructor(requested: string, reason: string) {
    super(`Refusing ${JSON.stringify(requested)}: ${reason}`);
    this.name = 'PlanScopeError';
    this.requested = requested;
  }
}

const inside = (root: string, candidate: string) => {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

/** The real path of `path`, or of its nearest existing ancestor joined with the rest. */
function realOrNearest(path: string): string {
  let existing = path;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    rest.unshift(existing.slice(dirname(existing).length + 1));
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return join(realpathSync.native(existing), ...rest);
}

/**
 * Resolves a plan-relative path from a filled task and refuses anything that
 * does not stay strictly inside `scope` (default: the plan's
 * `analysis_results/prototypes/`): absolute paths, `..` traversal, and a
 * symbolic link anywhere on the way that points elsewhere.
 */
export function resolvePlanScoped(
  fixture: Pick<DwpLoopFixture, 'planDir' | 'evidenceDir'>,
  requested: string,
  scope: string = fixture.evidenceDir
): string {
  if (requested.trim() === '' || requested.includes('\0'))
    throw new PlanScopeError(requested, 'it is empty or not a path.');
  if (isAbsolute(requested)) throw new PlanScopeError(requested, 'it is absolute.');
  const lexical = resolve(fixture.planDir, requested);
  if (!inside(scope, lexical) || lexical === resolve(scope))
    throw new PlanScopeError(requested, `it is not inside ${relative(fixture.planDir, scope)}/.`);
  const real = realOrNearest(lexical);
  if (!inside(realpathSync.native(scope), real))
    throw new PlanScopeError(requested, 'a symbolic link on the way leads outside the plan scope.');
  return lexical;
}

/**
 * The filled task's `protoyard quick …` command as argv for the CLI, with its
 * input resolved inside the plan and its output inside the evidence scope
 * (throws {@link PlanScopeError} before anything runs otherwise).
 */
export function planQuickArgs(fixture: DwpLoopFixture): string[] {
  const task = readFileSync(join(fixture.planDir, 'exploration-task.md'), 'utf8');
  const line = task.split('\n').find((text) => text.startsWith('protoyard quick '));
  if (!line) throw new Error('The filled task has no `protoyard quick` command.');
  const words = line.trim().split(/\s+/).slice(2);
  const valueFlags = new Set(['--blueprint', '--slug', '--seed', '--variants', '--out']);
  const booleanFlags = new Set(['--json']);
  const seenFlags = new Set<string>();
  const args: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] as string;
    if (booleanFlags.has(word)) continue; // the runner asks for the envelope itself
    if (!valueFlags.has(word)) {
      throw new PlanScopeError(
        word,
        'it is not an allowed quick option or uses an unsupported form.'
      );
    }
    if (seenFlags.has(word)) {
      throw new PlanScopeError(word, 'it is repeated.');
    }
    seenFlags.add(word);
    const value = words[i + 1];
    if (!value || value.startsWith('-')) {
      throw new PlanScopeError(value ?? '', `it is missing the value for ${word}.`);
    }
    args.push(word);
    if (word === '--blueprint') {
      i += 1;
      args.push(resolvePlanScoped(fixture, words[i] ?? '', fixture.planDir));
    } else if (word === '--out') {
      i += 1;
      args.push(resolvePlanScoped(fixture, words[i] ?? ''));
    } else {
      i += 1;
      args.push(value);
    }
  }
  return args;
}

/** Every regular file under `root` (relative POSIX path → sha256), links listed as `link:`. */
export function treeSnapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(root, path).split(sep).join('/');
      const info = lstatSync(path);
      if (info.isSymbolicLink()) files.set(rel, 'link:');
      else if (info.isDirectory()) walk(path);
      else files.set(rel, createHash('sha256').update(readFileSync(path)).digest('hex'));
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

/** Paths created, changed or removed between two snapshots. */
export function treeChanges(
  before: Map<string, string>,
  after: Map<string, string>
): { created: string[]; changed: string[]; removed: string[] } {
  return {
    created: [...after.keys()].filter((path) => !before.has(path)).sort(),
    changed: [...after.keys()]
      .filter((path) => before.has(path) && before.get(path) !== after.get(path))
      .sort(),
    removed: [...before.keys()].filter((path) => !after.has(path)).sort(),
  };
}

/** Fixture workspaces with `prefix` currently in the OS temp folder. */
export function fixtureTempDirs(prefix: string = DWP_LOOP_TEMP_PREFIX): string[] {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith(prefix))
    .sort();
}

/** Runs `body` with a fresh fixture and removes it afterwards, whether `body` succeeds or throws. */
export async function withDwpLoopFixture<T>(
  options: DwpLoopFixtureOptions,
  body: (fixture: DwpLoopFixture) => Promise<T>
): Promise<T> {
  const fixture = await createDwpLoopFixture(options);
  try {
    return await body(fixture);
  } finally {
    fixture.cleanup();
  }
}
