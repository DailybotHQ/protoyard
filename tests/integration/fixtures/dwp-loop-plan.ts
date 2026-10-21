import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function fillExplorationTemplate(): string {
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
    SLUG,
    SEED: '17',
    VARIANT_COUNT: '2',
    CRITERIA:
      '- The event explorer route is reachable.\n- The metrics route is reachable and records one local attempt.',
    SCRATCH_DIR: 'analysis_results/prototypes',
    PRIVATE_PORT: '4860',
    EVIDENCE_DIR: `analysis_results/prototypes/${SLUG}`,
    EVIDENCE: `- analysis_results/prototypes/${SLUG}/DECISION.md`,
    CHOSEN_VARIANT: 'v1',
    DECISION: 'iterate',
    FOLLOW_UP: 'Review the local evidence before any source-prototype work.',
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

/** Creates a disposable workspace and plan whose generated evidence is plan-scoped. */
export async function createDwpLoopFixture(): Promise<DwpLoopFixture> {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-dwp-loop-'));
  const planDir = join(root, 'plan');
  const evidenceDir = join(planDir, 'analysis_results', 'prototypes');
  const explorationDir = join(evidenceDir, SLUG);
  const rerunDir = join(evidenceDir, `${SLUG}-rerun`);
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
  writeFileSync(join(planDir, 'exploration-task.md'), fillExplorationTemplate());

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
