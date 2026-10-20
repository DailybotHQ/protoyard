import { entityTable } from '@protoyard/blueprint';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';

describe('generated world', () => {
  it.each(definition.scenarios.map(({ id }) => id))(
    'is deterministic and passes integrity for the %s scenario',
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

  it('seeds every blueprint entity in the active scenario', async () => {
    const input = definition.scenarios.find((s) => s.id === 'active');
    if (!input) throw new Error('missing the active scenario');
    const world = await generate(createGenerateContext(parseScenario(input)));
    for (const entity of blueprint.entities) {
      expect(Object.keys(world.tables), entity.name).toContain(entityTable(entity));
    }
  });

  it('adds believable shipment assignments and ordered delivery windows', async () => {
    const input = definition.scenarios.find((s) => s.id === 'active');
    if (!input) throw new Error('missing the active scenario');
    const world = await generate(createGenerateContext(parseScenario(input)));
    const shipments = world.tables.shipments ?? [];
    const driverIds = new Set((world.tables.drivers ?? []).map((row) => row.id));
    const vehicleIds = new Set((world.tables.vehicles ?? []).map((row) => row.id));
    const depotIds = new Set((world.tables.depots ?? []).map((row) => row.id));
    const personaIds = new Set(world.personas.map((persona) => persona.id));

    expect(shipments[0]).toMatchObject({
      trackingCode: 'HB-4100',
      status: 'queued',
      origin: 'North Pier',
    });
    expect(new Set(shipments.map((row) => row.status))).toEqual(
      new Set(['queued', 'dispatched', 'in-transit', 'delayed', 'delivered'])
    );
    for (const shipment of shipments) {
      expect(Date.parse(String(shipment.plannedEnd))).toBeGreaterThan(
        Date.parse(String(shipment.plannedStart))
      );
      expect(driverIds.has(String(shipment.driver))).toBe(true);
      expect(vehicleIds.has(String(shipment.vehicle))).toBe(true);
      expect(depotIds.has(String(shipment.depot))).toBe(true);
      expect(personaIds.has(String(shipment.assignedTo))).toBe(true);
    }
  });
});
