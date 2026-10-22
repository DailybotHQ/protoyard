import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_KIND_BUDGETS,
  KIND_BUDGET_KINDS,
  loadBudgets,
  parseBudgetConfig,
  resolveKindBudget,
} from '../src/lib/budgets.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('per-kind entry budgets', () => {
  it('falls back to the provisional defaults when no kinds key exists', () => {
    for (const kind of KIND_BUDGET_KINDS) {
      expect(resolveKindBudget(DEFAULT_BUDGET_CONFIG, kind)).toEqual(DEFAULT_KIND_BUDGETS[kind]);
    }
    expect(DEFAULT_KIND_BUDGETS.deck.initialJsGzipKb).toBe(150);
    expect(DEFAULT_KIND_BUDGETS.deck.singleFileKb).toBe(1536);
  });

  it('reads and merges a kinds key from the budget document', () => {
    const config = parseBudgetConfig({
      ...DEFAULT_BUDGET_CONFIG,
      kinds: { deck: { initialJsGzipKb: 120, cssGzipKb: 20, singleFileKb: 1200 } },
    });
    expect(resolveKindBudget(config, 'deck')).toEqual({
      initialJsGzipKb: 120,
      cssGzipKb: 20,
      singleFileKb: 1200,
    });
    expect(resolveKindBudget(config, 'page')).toEqual(DEFAULT_KIND_BUDGETS.page);
  });

  it('rejects unknown kinds and non-positive limits', () => {
    expect(() =>
      parseBudgetConfig({
        ...DEFAULT_BUDGET_CONFIG,
        kinds: { app: { initialJsGzipKb: 1, cssGzipKb: 1 } },
      })
    ).toThrow(/Invalid budget config/);
    expect(() =>
      parseBudgetConfig({
        ...DEFAULT_BUDGET_CONFIG,
        kinds: { deck: { initialJsGzipKb: 0, cssGzipKb: 30 } },
      })
    ).toThrow(/Invalid budget config/);
  });

  it('the repository budget file declares every kind entry', async () => {
    const config = await loadBudgets(repoRoot);
    for (const kind of KIND_BUDGET_KINDS) {
      expect(config.kinds?.[kind], kind).toBeDefined();
      expect(resolveKindBudget(config, kind).initialJsGzipKb).toBeLessThanOrEqual(
        config.defaults.initialJsGzipKb
      );
    }
  });
});
