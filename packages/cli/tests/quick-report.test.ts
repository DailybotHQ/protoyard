// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import {
  markdownCell,
  median,
  QUICK_METRICS_MAX_BYTES,
  renderReportMarkdown,
} from '../src/commands/quick/report.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player with a real asset manifest, so quick never needs a build. */
async function fixturePlayer(root: string) {
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
    source: 'repository' as const,
  };
}

beforeEach(async () => {
  ws = createWorkspace();
  const player = await fixturePlayer(ws.root);
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

/** An exploration with two variants and the content namespaces the player stores them under. */
async function explore() {
  const result = await run('--blueprint', ANALYTICS, '--slug', 'idea', '--variants', '2');
  expect(result.code, result.stderr || result.stdout).toBe(0);
  const { dir } = result.json<{ data: { dir: string } }>().data;
  const namespace = async (file: string) =>
    (
      await blueprintIdentity(
        parseBlueprint(JSON.parse(readFileSync(join(ws.root, dir, file), 'utf8')))
      )
    ).namespace;
  return {
    dir,
    base: await namespace('blueprint.json'),
    v1: await namespace('v1/blueprint.json'),
    v2: await namespace('v2/blueprint.json'),
  };
}

let clock = 0;
/** One attempt; start times advance so every attempt is distinct. */
function attempt(taskId: string, outcome: string, seconds: number, steps: number) {
  clock += 1;
  const start = Date.UTC(2026, 9, 20, 10, 0, clock);
  return {
    taskId,
    outcome,
    durationMs: seconds * 1000,
    steps,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + seconds * 1000).toISOString(),
  };
}

function metricsFile(
  name: string,
  namespace: string,
  attempts: unknown[],
  extra: Record<string, unknown> = {}
): string {
  const path = join(ws.root, 'tmp', name);
  mkdirSync(join(ws.root, 'tmp'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      format: 'protoyard-validation-metrics',
      version: 1,
      blueprint: { name: 'Pulse', namespace },
      exportedAt: '2026-10-20T12:00:00.000Z',
      tasks: [
        { id: 'find-signups', prompt: 'Open the event explorer and compare sign-ups by channel.' },
      ],
      attempts,
      ...extra,
    })
  );
  return path;
}

interface Report {
  sources: { file: string; variant: string | null; attempts: number }[];
  groups: {
    variant: string | null;
    attempts: number;
    tasks: {
      id: string;
      defined: boolean;
      attempts: number;
      successes: number;
      gaveUp: number;
      timedOut: number;
      successRate: number | null;
      medianDurationMs: number | null;
      medianSteps: number | null;
    }[];
  }[];
}

const readReport = (dir: string) =>
  JSON.parse(readFileSync(join(ws.root, dir, 'report.json'), 'utf8')) as Report;
const task = (report: Report, variant: string | null, id: string) =>
  report.groups.find((group) => group.variant === variant)?.tasks.find((t) => t.id === id);

describe('quick report building blocks', () => {
  it('takes medians of whole numbers and escapes Markdown cells', () => {
    expect(median([])).toBeNull();
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 21])).toBe(16);
    expect(markdownCell('a | b <img src=x>\n# h *x* [l](u)‮')).toBe(
      'a \\| b \\<img src=x\\> \\# h \\*x\\* \\[l\\](u)'
    );
  });

  it('renders the same Markdown for the same input', () => {
    const input = {
      name: 'Pulse',
      slug: 'idea',
      sources: 1,
      groups: [{ variant: null, label: 'Base', namespace: 'bp-x', attempts: 0, tasks: [] }],
    };
    expect(renderReportMarkdown(input)).toBe(renderReportMarkdown(input));
    expect(renderReportMarkdown(input)).toContain('task progress (which task is current) resets');
  });
});

describe('protoyard quick report', () => {
  it('aggregates per variant and task, counts repeated attempts once, and is deterministic', async () => {
    const { dir, base, v1 } = await explore();
    const baseAttempts = [
      attempt('find-signups', 'success', 30, 5),
      attempt('find-signups', 'success', 50, 7),
      attempt('find-signups', 'gave-up', 90, 12),
      attempt('record-metric', 'timed-out', 120, 4),
    ];
    const first = metricsFile('base-1.json', base, baseAttempts);
    const variant = metricsFile('v1.json', v1, [attempt('find-signups', 'success', 20, 3)]);

    const result = await run('report', 'idea', '--import', first, variant);
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{
      data: { imported: { added: boolean }[]; attempts: number; sources: number };
    }>().data;
    expect(data).toMatchObject({ attempts: 5, sources: 2 });
    expect(data.imported.map((entry) => entry.added)).toEqual([true, true]);

    let report = readReport(dir);
    expect(report.groups.map((group) => [group.variant, group.attempts])).toEqual([
      [null, 4],
      ['v1', 1],
      ['v2', 0],
    ]);
    expect(task(report, null, 'find-signups')).toMatchObject({
      defined: true,
      attempts: 3,
      successes: 2,
      gaveUp: 1,
      successRate: 0.667,
      medianDurationMs: 40_000,
      medianSteps: 6,
    });
    expect(task(report, null, 'record-metric')).toMatchObject({
      attempts: 1,
      timedOut: 1,
      successRate: 0,
      medianDurationMs: null,
      medianSteps: null,
    });
    expect(task(report, 'v1', 'find-signups')).toMatchObject({ attempts: 1, successRate: 1 });
    // A variant with no sessions still lists its tasks.
    expect(task(report, 'v2', 'find-signups')).toMatchObject({ attempts: 0, successRate: null });

    // A later download holds every earlier attempt plus new ones: repeats count once.
    const second = metricsFile('base-2.json', base, [
      ...baseAttempts,
      attempt('find-signups', 'success', 40, 6),
    ]);
    const again = await run('report', 'idea', '--import', second, first);
    expect(
      again.json<{ data: { imported: { added: boolean }[] } }>().data.imported.map((e) => e.added)
    ).toEqual([true, false]);
    report = readReport(dir);
    expect(task(report, null, 'find-signups')).toMatchObject({
      attempts: 4,
      successes: 3,
      medianDurationMs: 40_000,
      medianSteps: 6,
    });

    // Same inputs, same bytes (no clock), with or without re-importing.
    const json = readFileSync(join(ws.root, dir, 'report.json'), 'utf8');
    const markdown = readFileSync(join(ws.root, dir, 'REPORT.md'), 'utf8');
    expect((await run('report', 'idea')).code).toBe(0);
    expect(readFileSync(join(ws.root, dir, 'report.json'), 'utf8')).toBe(json);
    expect(readFileSync(join(ws.root, dir, 'REPORT.md'), 'utf8')).toBe(markdown);
    expect(markdown).toContain('| Task | Attempts | Success rate | Median time | Median steps |');
    expect(markdown).toContain('75%');
    expect(markdown).toContain('40.0 s');
  });

  it('rejects malformed or foreign metrics and writes nothing', async () => {
    const { dir, base } = await explore();
    const good = attempt('find-signups', 'success', 30, 5);
    const cases: [string, string][] = [
      ['not-json.json', '{nope'],
      ['format.json', metricsFile('f.json', base, [good], { format: 'something-else' })],
      ['extra.json', metricsFile('e.json', base, [good], { uploadTo: 'https://example.com' })],
      ['negative.json', metricsFile('n.json', base, [{ ...good, durationMs: -1 }])],
      ['outcome.json', metricsFile('o.json', base, [{ ...good, outcome: 'won' }])],
      ['task-id.json', metricsFile('t.json', base, [{ ...good, taskId: '../etc' }])],
      [
        'backwards.json',
        metricsFile('b.json', base, [{ ...good, endedAt: '2020-01-01T00:00:00.000Z' }]),
      ],
      ['foreign.json', metricsFile('x.json', 'bp-someoneelse', [good])],
    ];
    for (const [label, content] of cases) {
      const path = content.startsWith('{') ? join(ws.root, 'tmp', label) : content;
      if (content.startsWith('{')) writeFileSync(path, content);
      // A good file alongside: the bad one still fails the whole run.
      const result = await run(
        'report',
        'idea',
        '--import',
        metricsFile('ok.json', base, [good]),
        path
      );
      expect(result.code, label).toBe(4);
      expect(result.json<{ error: { code: string } }>().error.code, label).toBe('validation');
      expect(existsSync(join(ws.root, dir, 'metrics')), label).toBe(false);
      expect(existsSync(join(ws.root, dir, 'report.json')), label).toBe(false);
    }

    const huge = join(ws.root, 'tmp', 'huge.json');
    writeFileSync(huge, ' '.repeat(QUICK_METRICS_MAX_BYTES + 1));
    const tooBig = await run('report', 'idea', '--import', huge);
    expect(tooBig.json<{ error: { code: string } }>().error.code).toBe('validation');

    const missing = await run('report', 'idea', '--import', join(ws.root, 'tmp', 'nope.json'));
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('not_found');

    // A tampered stored file is caught on the next run.
    expect(
      (await run('report', 'idea', '--import', metricsFile('ok.json', base, [good]))).code
    ).toBe(0);
    const [stored] = readdirSync(join(ws.root, dir, 'metrics'));
    writeFileSync(join(ws.root, dir, 'metrics', stored as string), '{"format":"x"}');
    expect((await run('report', 'idea')).code).toBe(4);
  });

  it('escapes untrusted task prompts in REPORT.md', async () => {
    const { dir, base } = await explore();
    const hostile = metricsFile('hostile.json', base, [attempt('mystery-task', 'success', 10, 1)], {
      tasks: [{ id: 'mystery-task', prompt: '<img src=x onerror=alert(1)> | **x**\n# Heading' }],
    });
    expect((await run('report', 'idea', '--import', hostile)).code).toBe(0);
    const markdown = readFileSync(join(ws.root, dir, 'REPORT.md'), 'utf8');
    // Only escaped: no `<img` without a backslash before it.
    expect(markdown).not.toMatch(/(?<!\\)<img/);
    expect(markdown).not.toMatch(/^# Heading/m);
    expect(markdown).toContain('\\<img src=x onerror=alert(1)\\> \\| \\*\\*x\\*\\* \\# Heading');
    expect(markdown).toContain('(not in the blueprint)');
    expect(task(readReport(dir), null, 'mystery-task')).toMatchObject({
      defined: false,
      attempts: 1,
    });
  });
});
