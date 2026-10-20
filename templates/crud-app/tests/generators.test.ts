import { blueprintGeneratorVersion } from '@protoyard/blueprint';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';

const ids = ['empty', 'active', 'viewer', 'massive'] as const;

describe('crud-app generator', () => {
  it('declares the blueprint generator version, so a changed blueprint reseeds', () => {
    // Regression: prototype.ts used to pin `generatorVersion: 1`.
    expect(definition.generatorVersion).toBe(blueprintGeneratorVersion(blueprint));
    const changed = {
      ...blueprint,
      entities: blueprint.entities.map((entity, index) =>
        index === 0 ? { ...entity, seedCount: (entity.seedCount ?? 4) + 1 } : entity
      ),
    };
    expect(blueprintGeneratorVersion(changed)).not.toBe(definition.generatorVersion);
  });

  it('is deterministic and passes integrity for every scenario', async () => {
    for (const id of ids) {
      const input = definition.scenarios.find((s) => s.id === id);
      if (!input) throw new Error(`missing ${id}`);
      const scenario = parseScenario(input);
      const ctx = createGenerateContext(scenario);
      const a = await generate(ctx);
      const b = await generate(createGenerateContext(scenario));
      expect(a, id).toEqual(b);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: scenario.referenceTime }),
        id
      ).toEqual([]);
    }
  });

  it('scales empty vs active row counts from the blueprint entities', async () => {
    const empty = await generate(
      createGenerateContext(parseScenario(definition.scenarios.find((s) => s.id === 'empty')!))
    );
    const active = await generate(
      createGenerateContext(parseScenario(definition.scenarios.find((s) => s.id === 'active')!))
    );
    expect(empty.tables.projects ?? []).toHaveLength(0);
    expect(empty.tables.tasks ?? []).toHaveLength(0);
    expect((active.tables.projects ?? []).length).toBeGreaterThan(0);
    expect((active.tables.tasks ?? []).length).toBeGreaterThan(0);
    expect(blueprint.entities.map((e) => e.name).sort()).toEqual(['project', 'task']);
  });
});
