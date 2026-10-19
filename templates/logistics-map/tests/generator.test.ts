import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { LogisticsDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';

describe('logistics-map scenarios', () => {
  it('seeds deterministic fictional depots, routes and shipments', async () => {
    const harness = createHarness<LogisticsDatabase>(definition);
    try {
      const first = await harness.boot('active-dispatch');
      const data = await first.db.shipments.toArray();
      expect(data).toHaveLength(8);
      expect(
        data.every((shipment) => shipment.route.length >= 2 && shipment.destination.lat < 0)
      ).toBe(true);
      const second = await harness.boot('active-dispatch');
      expect(await second.db.shipments.toArray()).toEqual(data);
    } finally {
      harness.closeAll();
    }
  });
});
