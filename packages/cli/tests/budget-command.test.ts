// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET_CONFIG, parseBudgetConfig, resolveBudget } from '../src/lib/budgets.ts';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

describe('protoyard budget', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('passes when a fixture build manifest is within both configured bundle budgets', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'sample-app');
    ws.write('artifacts/sample-app/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'sample-app',
      bundle: { initialJsGzip: 512, cssGzip: 1024 },
    });
    ws.write('protoyard.budgets.json', {
      ...DEFAULT_BUDGET_CONFIG,
      defaults: { ...DEFAULT_BUDGET_CONFIG.defaults, initialJsGzipKb: 1, cssGzipKb: 1 },
    });

    const run = await cli(['--root', ws.root, '--json', 'budget', 'sample-app', '--skip-build']);

    expect(run.code).toBe(0);
    const data = run.json<{
      data: {
        total: number;
        failed: number;
        results: Array<{
          slug: string;
          ok: boolean;
          metrics: Array<{
            metric: string;
            value: number;
            budget: number;
            headroom: number;
            ok: boolean;
          }>;
        }>;
      };
    }>().data;
    expect(data).toMatchObject({ total: 1, failed: 0 });
    expect(data.results[0]).toMatchObject({
      slug: 'sample-app',
      ok: true,
      metrics: [
        { metric: 'initialJsGzip', value: 0.5, budget: 1, headroom: 0.5, ok: true },
        { metric: 'cssGzip', value: 1, budget: 1, headroom: 0, ok: true },
      ],
    });
  });

  it('measures a template by slug, like a prototype', async () => {
    ws = createWorkspace();
    addTemplate(ws, 'dashboard');
    ws.write('artifacts/templates/dashboard/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'dashboard',
      bundle: { initialJsGzip: 512, cssGzip: 512 },
    });

    const run = await cli(['--root', ws.root, '--json', 'budget', 'dashboard', '--skip-build']);

    expect(run.code).toBe(0);
    const data = run.json<{
      data: { total: number; results: Array<{ slug: string; ok: boolean }> };
    }>();
    expect(data.data.total).toBe(1);
    expect(data.data.results[0]).toMatchObject({ slug: 'dashboard', ok: true });
  });

  it('returns validation exit code 4 when a fixture bundle exceeds its budget', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'sample-app');
    ws.write('artifacts/sample-app/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'sample-app',
      bundle: { initialJsGzip: 1024, cssGzip: 512 },
    });
    ws.write('protoyard.budgets.json', {
      ...DEFAULT_BUDGET_CONFIG,
      defaults: { ...DEFAULT_BUDGET_CONFIG.defaults, initialJsGzipKb: 0.5, cssGzipKb: 1 },
    });

    const run = await cli(['--root', ws.root, '--json', 'budget', 'sample-app', '--skip-build']);

    expect(run.code).toBe(4);
    const envelope = run.json<{
      error: { code: string };
      data: { failed: number; results: Array<{ ok: boolean; metrics: Array<{ ok: boolean }> }> };
    }>();
    expect(envelope.error.code).toBe('validation');
    expect(envelope.data.failed).toBe(1);
    expect(envelope.data.results[0]?.metrics.map((metric) => metric.ok)).toEqual([false, true]);
  });

  it('fails with validation when an existing build manifest has no bundle field', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'sample-app');
    ws.write('artifacts/sample-app/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'sample-app',
    });

    const run = await cli(['--root', ws.root, '--json', 'budget', 'sample-app', '--skip-build']);

    expect(run.code).toBe(4);
    expect(
      run.json<{ error: { code: string }; data: { results: Array<{ error?: string }> } }>()
    ).toMatchObject({
      error: { code: 'validation' },
      data: { results: [{ error: expect.stringContaining('no valid bundle metrics') }] },
    });
  });

  it('reports a prototype it could not measure as unchecked, never as over budget', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'sample-app');
    addPrototype(ws, 'broken-app');
    ws.write('artifacts/sample-app/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'sample-app',
      bundle: { initialJsGzip: 1024, cssGzip: 512 },
    });
    ws.write('artifacts/broken-app/build-manifest.json', {
      format: 'protoyard.build',
      slug: 'broken-app',
    });

    const run = await cli(['--root', ws.root, '--json', 'budget', '--all', '--skip-build']);

    expect(run.code).toBe(4);
    const message = run.json<{ error: { message: string } }>().error.message;
    expect(message).toContain('1 of 2 prototype(s) could not be checked');
    expect(message).toContain('no valid bundle metrics');
    expect(message).not.toMatch(/over budget|failed budget checks/);
  });
});

describe('idea-to-running budgets', () => {
  it('accepts optional total and phase thresholds while defaulting older config files to null', () => {
    const legacy = parseBudgetConfig({
      format: 'protoyard.budgets',
      version: 1,
      defaults: {
        initialJsGzipKb: 250,
        cssGzipKb: 30,
        coldStartMs: null,
        generateMs: 50,
        indexColdMs: 100,
      },
      overrides: {},
    });
    expect(resolveBudget(legacy, 'sample-app')).toMatchObject({
      ideaToRunningMs: null,
      briefToBlueprintMs: null,
      blueprintValidationMs: null,
      prototypeGenerationMs: null,
      prototypeBuildMs: null,
      previewReadyMs: null,
    });

    const configured = parseBudgetConfig({
      ...legacy,
      defaults: {
        ...legacy.defaults,
        ideaToRunningMs: 90_000,
        briefToBlueprintMs: 5_000,
        blueprintValidationMs: 1_000,
        prototypeGenerationMs: 10_000,
        prototypeBuildMs: 65_000,
        previewReadyMs: 9_000,
      },
    });
    expect(resolveBudget(configured, 'sample-app')).toMatchObject({
      ideaToRunningMs: 90_000,
      briefToBlueprintMs: 5_000,
      blueprintValidationMs: 1_000,
      prototypeGenerationMs: 10_000,
      prototypeBuildMs: 65_000,
      previewReadyMs: 9_000,
    });
  });
});
