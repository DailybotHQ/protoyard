import { entityTable, relationProperty } from '@protoyard/blueprint';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';

describe('generated world', () => {
  it('is deterministic and passes integrity for every scenario', async () => {
    for (const input of definition.scenarios) {
      const scenario = parseScenario(input);
      const a = await generate(createGenerateContext(scenario));
      const b = await generate(createGenerateContext(scenario));
      expect(a, scenario.id).toEqual(b);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: scenario.referenceTime }),
        scenario.id
      ).toEqual([]);
    }
  });

  it('seeds every blueprint entity in the active scenario', async () => {
    const input = definition.scenarios.find((s) => s.id === 'active');
    if (!input) throw new Error('missing the active scenario');
    const world = await generate(createGenerateContext(parseScenario(input)));
    for (const entity of blueprint.entities) {
      expect(Object.keys(world.tables), entity.name).toContain(entityTable(entity));
    }
  });

  it('seeds calendar-ready bookings with valid start dates and studio references', async () => {
    const input = definition.scenarios.find((s) => s.id === 'active');
    if (!input) throw new Error('missing the active scenario');
    const world = await generate(createGenerateContext(parseScenario(input)));
    const rows = (name: string) =>
      world.tables[
        entityTable(blueprint.entities.find((entity) => entity.name === name)!)
      ] as Record<string, unknown>[];
    const bookings = rows('booking');
    const bookingEntity = blueprint.entities.find((entity) => entity.name === 'booking');
    if (!bookingEntity) throw new Error('missing the booking entity');
    const references = new Map(
      ['client', 'class', 'instructor', 'room'].map((name) => [
        name,
        new Set(rows(name).map((row) => row.id)),
      ])
    );

    expect(bookings.length).toBeGreaterThan(0);
    for (const booking of bookings) {
      expect(Number.isNaN(Date.parse(String(booking.startsAt)))).toBe(false);
      for (const name of references.keys()) {
        const field = bookingEntity.fields.find((candidate) => candidate.name === name);
        if (!field) throw new Error(`missing booking relation ${name}`);
        const property = relationProperty(field);
        expect(property).toBeDefined();
        const relatedId = booking[property!];
        if (relatedId != null) {
          expect(references.get(name)?.has(relatedId), `${name} relation`).toBe(true);
        }
      }
    }
  });
});
