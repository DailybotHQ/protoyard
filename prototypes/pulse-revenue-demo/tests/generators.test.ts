import { entityTable } from '@protoyard/blueprint';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';

describe('generated world', () => {
  it.each(definition.scenarios.map(({ id }) => id))(
    'is deterministic and passes integrity for %s',
    async (scenarioId) => {
      const input = definition.scenarios.find(({ id }) => id === scenarioId);
      if (!input) throw new Error(`missing ${scenarioId} scenario`);
      const scenario = parseScenario(input);
      const a = await generate(createGenerateContext(scenario));
      const b = await generate(createGenerateContext(scenario));
      expect(a).toEqual(b);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: scenario.referenceTime })
      ).toEqual([]);
    }
  );

  it('seeds every blueprint entity in the quarter-of-history scenario', async () => {
    const input = definition.scenarios.find((s) => s.id === 'quarter-of-history');
    if (!input) throw new Error('missing quarter-of-history');
    const scenario = parseScenario(input);
    const world = await generate(createGenerateContext(scenario));
    for (const entity of blueprint.entities) {
      expect(Object.keys(world.tables), entity.name).toContain(entityTable(entity));
    }
  });

  it('keeps transaction amounts as integer cents with ascending historical timestamps', async () => {
    const input = definition.scenarios.find((s) => s.id === 'quarter-of-history');
    if (!input) throw new Error('missing quarter-of-history');
    const scenario = parseScenario(input);
    const world = await generate(createGenerateContext(scenario));
    const transactions = world.tables.transactions ?? [];
    const amounts = transactions.map((row) => row.amount);
    const dates = transactions.map((row) => Date.parse(String(row.createdAt)));

    expect(transactions.length).toBeGreaterThan(20);
    expect(amounts.every((amount) => Number.isSafeInteger(amount) && Number(amount) > 0)).toBe(
      true
    );
    expect(dates.every((date) => Number.isFinite(date))).toBe(true);
    expect(Math.max(...dates)).toBeLessThanOrEqual(Date.parse(scenario.referenceTime));
  });

  it('shapes launch-spike revenue above the quarter-of-history baseline', async () => {
    const quarter = definition.scenarios.find((s) => s.id === 'quarter-of-history');
    const launch = definition.scenarios.find((s) => s.id === 'launch-spike');
    if (!quarter || !launch) throw new Error('missing revenue scenarios');
    const [baseline, spike] = await Promise.all([
      generate(createGenerateContext(parseScenario(quarter))),
      generate(createGenerateContext(parseScenario(launch))),
    ]);
    const revenue = (world: typeof baseline) =>
      (world.tables.transactions ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

    expect(revenue(spike)).toBeGreaterThan(revenue(baseline));
  });
});
