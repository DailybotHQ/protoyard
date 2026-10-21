// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_PERFORMANCE_BUDGETS,
  loadBudgets,
  parseBudgetConfig,
  resolveBudget,
} from '../src/lib/budgets.ts';
import { createWorkspace, type TempWorkspace } from './helpers.ts';

describe('workspace performance budgets', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('parses a versioned budget config', () => {
    expect(parseBudgetConfig(DEFAULT_BUDGET_CONFIG)).toEqual(DEFAULT_BUDGET_CONFIG);
  });

  it('accepts a quickReadyMs budget, null until calibrated, and refuses nonsense', () => {
    const base = { ...DEFAULT_BUDGET_CONFIG, defaults: { ...DEFAULT_BUDGET_CONFIG.defaults } };
    expect(DEFAULT_PERFORMANCE_BUDGETS.quickReadyMs).toBeNull();
    expect(
      parseBudgetConfig({ ...base, defaults: { ...base.defaults, quickReadyMs: 12_000 } }).defaults
        .quickReadyMs
    ).toBe(12_000);
    const { quickReadyMs: _omitted, ...withoutKey } = base.defaults;
    expect(parseBudgetConfig({ ...base, defaults: withoutKey }).defaults.quickReadyMs).toBeNull();
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, '12000']) {
      expect(
        () => parseBudgetConfig({ ...base, defaults: { ...base.defaults, quickReadyMs: bad } }),
        String(bad)
      ).toThrow();
    }
  });

  it('uses built-in defaults when the workspace file is missing', async () => {
    ws = createWorkspace();
    const config = await loadBudgets(ws.root);
    expect(config).toEqual(DEFAULT_BUDGET_CONFIG);
    expect(resolveBudget(config, 'crm-demo')).toEqual(DEFAULT_PERFORMANCE_BUDGETS);
  });

  it('merges a partial prototype override over workspace defaults', async () => {
    ws = createWorkspace();
    ws.write('protoyard.budgets.json', {
      ...DEFAULT_BUDGET_CONFIG,
      overrides: { 'crm-demo': { initialJsGzipKb: 280, coldStartMs: 1200 } },
    });

    const config = await loadBudgets(ws.root);
    expect(resolveBudget(config, 'crm-demo')).toEqual({
      ...DEFAULT_PERFORMANCE_BUDGETS,
      initialJsGzipKb: 280,
      coldStartMs: 1200,
    });
    expect(resolveBudget(config, 'other-app')).toEqual(DEFAULT_PERFORMANCE_BUDGETS);
  });

  it('reports malformed JSON and schema errors with the config path', async () => {
    ws = createWorkspace();
    ws.write('protoyard.budgets.json', '{ broken');
    await expect(loadBudgets(ws.root)).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('Invalid JSON in'),
    });

    ws.write('protoyard.budgets.json', {
      ...DEFAULT_BUDGET_CONFIG,
      version: 2,
      defaults: { ...DEFAULT_PERFORMANCE_BUDGETS, initialJsGzipKb: 0 },
    });
    await expect(loadBudgets(ws.root)).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('Invalid budget config in'),
    });
  });
});
