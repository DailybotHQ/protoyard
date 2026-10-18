// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET_CONFIG } from '../src/lib/budgets.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

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
});
