// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { blueprintIdentity } from '../../packages/blueprint/src/identity.ts';
import { setQuickPlayerLocator } from '../../packages/cli/src/commands/quick/index.ts';
import { cli } from '../../packages/cli/tests/helpers.ts';
import {
  createDwpLoopFixture,
  type DwpLoopFixture,
  writeBrowserSkip,
  writeDecision,
} from './fixtures/dwp-loop-plan.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const fixtures: DwpLoopFixture[] = [];

function hostSnapshot(): string {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', '.'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function under(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

function writeMetrics(path: string, namespace: string): void {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        format: 'protoyard-validation-metrics',
        version: 1,
        blueprint: { name: 'Quick Product Analytics', namespace },
        exportedAt: '2026-10-20T12:00:00.000Z',
        tasks: [{ id: 'find-signups', prompt: 'Compare sign-ups by channel.' }],
        attempts: [
          {
            taskId: 'find-signups',
            outcome: 'success',
            durationMs: 30000,
            steps: 4,
            startedAt: '2026-10-20T12:00:00.000Z',
            endedAt: '2026-10-20T12:00:30.000Z',
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

afterEach(() => {
  while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

describe('temporary DWP exploration loop', () => {
  it('creates plan-scoped variants, metrics, and decision evidence without host changes', async () => {
    const before = hostSnapshot();
    const fixture = await createDwpLoopFixture();
    fixtures.push(fixture);
    const restore = setQuickPlayerLocator(() => fixture.player);
    try {
      const run = (...args: string[]) => cli(['--root', fixture.root, '--json', 'quick', ...args]);
      const first = await run(
        '--blueprint',
        fixture.blueprintPath,
        '--slug',
        'dwp-loop-fixture',
        '--seed',
        '17',
        '--variants',
        '2',
        '--out',
        fixture.explorationDir,
        '--allow-external-out',
        '--standalone'
      );
      expect(first.code, first.stderr || first.stdout).toBe(0);
      const firstData = first.json<{
        data: { blueprintSha256: string; variants: { id: string; blueprintSha256: string }[] };
      }>().data;
      writeFileSync(join(fixture.evidenceDir, 'dwp-loop-fixture.envelope.json'), first.stdout);
      expect(firstData.variants.map((variant) => variant.id)).toEqual(['v1', 'v2']);

      const rerun = await run(
        '--blueprint',
        fixture.blueprintPath,
        '--slug',
        'dwp-loop-fixture-rerun',
        '--seed',
        '17',
        '--variants',
        '2',
        '--out',
        fixture.rerunDir,
        '--allow-external-out',
        '--standalone'
      );
      expect(rerun.code, rerun.stderr || rerun.stdout).toBe(0);
      const rerunData = rerun.json<{
        data: { blueprintSha256: string; variants: { id: string; blueprintSha256: string }[] };
      }>().data;
      writeFileSync(
        join(fixture.evidenceDir, 'dwp-loop-fixture-rerun.envelope.json'),
        rerun.stdout
      );
      expect(rerunData.blueprintSha256).toBe(firstData.blueprintSha256);
      expect(
        rerunData.variants.map(({ id, blueprintSha256 }) => ({ id, blueprintSha256 }))
      ).toEqual(firstData.variants.map(({ id, blueprintSha256 }) => ({ id, blueprintSha256 })));

      const base = JSON.parse(readFileSync(join(fixture.explorationDir, 'blueprint.json'), 'utf8'));
      const namespace = (await blueprintIdentity(base)).namespace;
      writeMetrics(fixture.metricsPath, namespace);
      const report = await cli([
        '--root',
        fixture.root,
        '--json',
        'quick',
        'report',
        fixture.explorationDir,
        '--import',
        fixture.metricsPath,
      ]);
      expect(report.code, report.stderr || report.stdout).toBe(0);
      writeBrowserSkip(fixture.browserEvidencePath);
      writeDecision(fixture.decisionPath);

      for (const path of [
        fixture.explorationDir,
        fixture.rerunDir,
        join(fixture.explorationDir, 'blueprint.json'),
        join(fixture.explorationDir, 'v1', 'blueprint.json'),
        join(fixture.explorationDir, 'v2', 'blueprint.json'),
        join(fixture.explorationDir, 'quick.json'),
        join(fixture.explorationDir, 'report.json'),
        join(fixture.explorationDir, 'REPORT.md'),
        fixture.browserEvidencePath,
        fixture.decisionPath,
        join(fixture.evidenceDir, 'dwp-loop-fixture.envelope.json'),
        join(fixture.evidenceDir, 'dwp-loop-fixture-rerun.envelope.json'),
      ]) {
        expect(existsSync(path), path).toBe(true);
        expect(under(fixture.evidenceDir, path), path).toBe(true);
      }
      expect(readdirSync(fixture.explorationDir)).toContain('player');
      expect(readFileSync(join(fixture.planDir, 'exploration-task.md'), 'utf8')).not.toMatch(
        /\{\{[A-Z_]+\}\}/
      );
      expect(readFileSync(fixture.browserEvidencePath, 'utf8')).toContain('playwright-unavailable');
      expect(readFileSync(join(fixture.explorationDir, 'REPORT.md'), 'utf8')).toContain(
        'Simulated data only'
      );
      expect(hostSnapshot()).toBe(before);
    } finally {
      restore();
    }
  }, 120_000);
});
