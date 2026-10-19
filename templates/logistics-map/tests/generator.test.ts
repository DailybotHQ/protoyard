import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { LogisticsDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { scenarios } from '../src/scenarios/index.ts';

describe('logistics-map scenarios', () => {
  it('seeds deterministic fictional depots, vehicles, routes and shipments per scenario', async () => {
    for (const scenario of scenarios) {
      const harness = createHarness<LogisticsDatabase>(definition);
      try {
        const first = await harness.boot(scenario.id);
        const data = {
          depots: await first.db.depots.orderBy('id').toArray(),
          vehicles: await first.db.vehicles.orderBy('id').toArray(),
          shipments: await first.db.shipments.orderBy('id').toArray(),
        };
        const second = await harness.boot(scenario.id);
        expect({
          depots: await second.db.depots.orderBy('id').toArray(),
          vehicles: await second.db.vehicles.orderBy('id').toArray(),
          shipments: await second.db.shipments.orderBy('id').toArray(),
        }).toEqual(data);
        expect(data.depots).toHaveLength(2);
        expect(data.vehicles).toHaveLength(4);
        expect(data.shipments).toHaveLength(Number(scenario.generators?.shipments ?? 8));
        expect(data.shipments.every((shipment) => shipment.route.length >= 2)).toBe(true);
        expect(data.shipments.every((shipment) => shipment.destination.lat < 0)).toBe(true);
        expect(data.shipments.every((shipment) => shipment.deliveredAt === null)).toBe(true);
      } finally {
        harness.closeAll();
      }
    }
  });
});
