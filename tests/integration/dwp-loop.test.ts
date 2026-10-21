// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { blueprintIdentity } from '../../packages/blueprint/src/identity.ts';
import { setQuickPlayerLocator } from '../../packages/cli/src/commands/quick/index.ts';
import { launchChromium } from '../../packages/cli/src/lib/capture/index.ts';
import { cli } from '../../packages/cli/tests/helpers.ts';
import {
  createDwpLoopFixture,
  type DwpLoopFixture,
  planQuickArgs,
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

interface VariantsEnvelope {
  ok: boolean;
  command: string;
  data: {
    slug: string;
    dir: string;
    blueprintSha256: string;
    layout: string;
    variants: { id: string; label: string; blueprintSha256: string; open: string }[];
    compare: string | null;
    screenshots: {
      files: { variant: string | null; path: string; width: number; height: number }[];
      skipped: { reason: string; detail: string } | null;
    };
  };
}

describe('temporary DWP variants loop', () => {
  it('runs the template’s quick command with three variants and records a screenshot pass or skip', async () => {
    const before = hostSnapshot();
    const fixture = await createDwpLoopFixture({ slug: 'dwp-variants', variantCount: 3 });
    fixtures.push(fixture);
    // A browser here captures the real player; without one the capture is skipped and recorded.
    const probe = await launchChromium();
    if (probe.ok) await probe.browser.close();
    const restore = probe.ok ? () => {} : setQuickPlayerLocator(() => fixture.player);
    try {
      // The task's own command, with its paths confined to the plan (input) and
      // its evidence folder (output); an escaping path throws before anything runs.
      const args = planQuickArgs(fixture);
      expect(args).toEqual(
        expect.arrayContaining(['--slug', 'dwp-variants', '--seed', '17', '--variants', '3'])
      );
      expect(args).toContain(fixture.explorationDir);
      const run = (...extra: string[]) =>
        cli(['--root', fixture.root, '--json', 'quick', ...args, '--allow-external-out', ...extra]);

      const result = await run('--screenshot');
      expect(result.code, result.stderr || result.stdout).toBe(0);
      writeFileSync(join(fixture.evidenceDir, 'dwp-variants.envelope.json'), result.stdout);
      const envelope = result.json<VariantsEnvelope>();
      expect(envelope).toMatchObject({ ok: true, command: 'quick' });
      const { data } = envelope;

      // Three deterministic, distinct variants with their own launchers and a compare page.
      expect(data.variants.map((variant) => variant.id)).toEqual(['v1', 'v2', 'v3']);
      const hashes = [data.blueprintSha256, ...data.variants.map((v) => v.blueprintSha256)];
      expect(new Set(hashes).size).toBe(4);
      for (const variant of data.variants) {
        expect(variant.label.length, variant.id).toBeGreaterThan(0);
        expect(existsSync(join(fixture.root, variant.open)), variant.open).toBe(true);
      }
      expect(data.compare).not.toBeNull();
      expect(existsSync(join(fixture.root, data.compare as string))).toBe(true);
      expect(data.layout).toBe('standalone');

      // Screenshots: a recorded pass (one desktop PNG per blueprint) or a recorded skip.
      const record = JSON.parse(readFileSync(join(fixture.explorationDir, 'quick.json'), 'utf8'));
      if (probe.ok) {
        expect(data.screenshots.skipped).toBeNull();
        expect(
          data.screenshots.files.map((file) => [file.variant, file.width, file.height])
        ).toEqual([
          [null, 1280, 800],
          ['v1', 1280, 800],
          ['v2', 1280, 800],
          ['v3', 1280, 800],
        ]);
        for (const file of data.screenshots.files) {
          expect(existsSync(join(fixture.explorationDir, file.path)), file.path).toBe(true);
        }
        expect(record.screenshots.files).toHaveLength(4);
      } else {
        expect(['playwright-unavailable', 'browser-unavailable']).toContain(
          data.screenshots.skipped?.reason
        );
        expect(record.screenshots.skipped.reason).toBe(data.screenshots.skipped?.reason);
      }
      writeFileSync(
        fixture.browserEvidencePath,
        `${JSON.stringify(
          data.screenshots.skipped
            ? {
                kind: 'browser-evidence',
                status: 'skipped',
                reason: data.screenshots.skipped.reason,
              }
            : {
                kind: 'browser-evidence',
                status: 'captured',
                files: data.screenshots.files.map((file) => file.path),
              },
          null,
          2
        )}\n`
      );

      // The same template command again (no capture) gives the same variants.
      const rerunArgs = args.map((arg) =>
        arg === fixture.explorationDir ? fixture.rerunDir : arg
      );
      const rerun = await cli([
        '--root',
        fixture.root,
        '--json',
        'quick',
        ...rerunArgs,
        '--allow-external-out',
        '--slug',
        'dwp-variants-rerun',
      ]);
      expect(rerun.code, rerun.stderr || rerun.stdout).toBe(0);
      const again = rerun.json<VariantsEnvelope>().data;
      expect(again.blueprintSha256).toBe(data.blueprintSha256);
      expect(
        again.variants.map(({ id, label, blueprintSha256 }) => ({ id, label, blueprintSha256 }))
      ).toEqual(
        data.variants.map(({ id, label, blueprintSha256 }) => ({ id, label, blueprintSha256 }))
      );

      // Decision-ready: every artifact sits under the plan's evidence folder.
      writeDecision(fixture.decisionPath);
      for (const path of [
        join(fixture.explorationDir, 'quick.json'),
        join(fixture.explorationDir, 'compare.html'),
        ...['v1', 'v2', 'v3'].map((id) => join(fixture.explorationDir, id, 'blueprint.json')),
        join(fixture.evidenceDir, 'dwp-variants.envelope.json'),
        fixture.browserEvidencePath,
        fixture.decisionPath,
        fixture.rerunDir,
      ]) {
        expect(existsSync(path), path).toBe(true);
        expect(under(fixture.evidenceDir, path), path).toBe(true);
      }
      expect(record.variants.map((variant: { id: string }) => variant.id)).toEqual([
        'v1',
        'v2',
        'v3',
      ]);
      expect(hostSnapshot()).toBe(before);
    } finally {
      restore();
    }
  }, 240_000);
});
