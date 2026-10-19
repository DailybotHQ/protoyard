import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { LogisticsDatabase } from '../src/database/schema.ts';
import { createLogisticsServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<LogisticsDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<LogisticsDatabase>(definition);
};

describe('logistics dispatch services', () => {
  it('dispatches and reassigns a shipment through persisted transactions', async () => {
    fresh();
    let runtime = await harness.boot('active-dispatch');
    const services = createLogisticsServices(runtime);
    const ready = (await runtime.db.shipments.toArray()).find(
      (shipment) => shipment.status === 'ready'
    );
    if (!ready) throw new Error('the active scenario contains ready freight');
    const vehicles = await runtime.db.vehicles.where('depotId').equals(ready.depotId).toArray();
    await services.dispatch({ shipmentId: ready.id, vehicleId: vehicles[0]!.id });
    const other = vehicles.find((vehicle) => vehicle.id !== vehicles[0]?.id);
    if (other) await services.reassign(ready.id, other.id);
    runtime = await harness.reload(runtime);
    const stored = await runtime.db.shipments.get(ready.id);
    expect(stored?.status).toBe('in-transit');
    expect(stored?.dispatchedAt).toBe(runtime.clock.now().toISOString());
    expect(stored?.vehicleId).toBe(other?.id ?? vehicles[0]?.id);
  });

  it('keeps dispatch blocked when the simulated network is offline', async () => {
    fresh();
    const runtime = await harness.boot('network-offline');
    const services = createLogisticsServices(runtime);
    const ready = (await runtime.db.shipments.toArray()).find(
      (shipment) => shipment.status === 'ready'
    );
    if (!ready) throw new Error('the offline scenario contains ready freight');
    const vehicle = (await runtime.db.vehicles.where('depotId').equals(ready.depotId).toArray())[0];
    if (!vehicle) throw new Error('the scenario has a depot vehicle');
    await expect(
      services.dispatch({ shipmentId: ready.id, vehicleId: vehicle.id })
    ).rejects.toThrow();
    expect((await runtime.db.shipments.get(ready.id))?.status).toBe('ready');
  });
});
