// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_CONTENT_KIND_BUDGETS,
  parseBudgetConfig,
  resolveBudget,
} from '../src/lib/budgets.ts';

describe('content-kind budget defaults (Corag UG-57)', () => {
  it('gives a deck, page or doc prototype its kind defaults, and apps the workspace defaults', () => {
    const config = structuredClone(DEFAULT_BUDGET_CONFIG);
    expect(resolveBudget(config, 'my-deck', 'deck').cssGzipKb).toBe(
      DEFAULT_CONTENT_KIND_BUDGETS.deck.cssGzipKb
    );
    expect(resolveBudget(config, 'my-deck', 'deck').initialJsGzipKb).toBe(293.1);
    expect(resolveBudget(config, 'my-doc', 'doc').initialJsGzipKb).toBe(250);
    expect(resolveBudget(config, 'my-app', 'app').cssGzipKb).toBe(30);
    expect(resolveBudget(config, 'legacy', undefined).cssGzipKb).toBe(30);
  });

  it('lets the workspace and a slug override win, in that order', () => {
    const config = parseBudgetConfig({
      ...DEFAULT_BUDGET_CONFIG,
      contentKinds: { page: { cssGzipKb: 60 } },
      overrides: { 'launch-page': { cssGzipKb: 55, reason: 'Measured.' } },
    });
    expect(resolveBudget(config, 'other-page', 'page').cssGzipKb).toBe(60);
    expect(resolveBudget(config, 'launch-page', 'page').cssGzipKb).toBe(55);
    expect(() =>
      parseBudgetConfig({ ...DEFAULT_BUDGET_CONFIG, contentKinds: { app: {} } })
    ).toThrow();
  });
});
