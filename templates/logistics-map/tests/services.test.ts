import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
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

async function shipmentAndVehicle(
  runtime: Awaited<ReturnType<typeof harness.boot>>,
  status: 'ready' | 'in-transit'
) {
  const shipment = (await runtime.db.shipments.toArray()).find((item) => item.status === status);
  if (!shipment) throw new Error(`scenario contains a ${status} shipment`);
  const vehicles = await runtime.db.vehicles.where('depotId').equals(shipment.depotId).toArray();
  if (vehicles.length < 1) throw new Error('scenario contains a depot vehicle');
  return { shipment, vehicles };
}

describe('logistics dispatch services on the real runtime', () => {
  it('dispatches and reassigns through persisted transactions', async () => {
    fresh();
    let runtime = await harness.boot('active-dispatch');
    const services = createLogisticsServices(runtime);
    const { shipment, vehicles } = await shipmentAndVehicle(runtime, 'ready');
    const replacement = vehicles.find((vehicle) => vehicle.id !== vehicles[0]?.id);
    await services.dispatch({ shipmentId: shipment.id, vehicleId: vehicles[0]!.id });
    if (replacement) await services.reassign(shipment.id, replacement.id);
    runtime = await harness.reload(runtime);
    const stored = await runtime.db.shipments.get(shipment.id);
    expect(stored?.status).toBe('in-transit');
    expect(stored?.dispatchedAt).toBe(runtime.clock.now().toISOString());
    expect(stored?.deliveredAt).toBeNull();
    expect(stored?.vehicleId).toBe(replacement?.id ?? vehicles[0]?.id);
  });

  it('persists a deterministic delivered transition when simulated time reaches the ETA', async () => {
    fresh();
    const runtime = await harness.boot('active-dispatch');
    const services = createLogisticsServices(runtime);
    const { shipment, vehicles } = await shipmentAndVehicle(runtime, 'ready');
    await services.dispatch({ shipmentId: shipment.id, vehicleId: vehicles[0]!.id });
    const dispatched = await runtime.db.shipments.get(shipment.id);
    if (!dispatched?.dueAt) throw new Error('dispatch records an ETA');

    await runtime.scenarios.advance({ days: 1 });
    expect(await runtime.db.shipments.get(shipment.id)).toMatchObject({
      status: 'delivered',
      deliveredAt: dispatched.dueAt,
    });
    const recordedEvents = await runtime.db.table('py_events').toArray();
    expect(
      recordedEvents.some((event: { id: string }) =>
        event.id.includes(`shipment-delivered:${shipment.id}:${dispatched.dueAt}`)
      )
    ).toBe(true);
  });

  it('denies dispatch and reassignment for a read-only actor without writes', async () => {
    fresh();
    const runtime = await harness.boot('active-dispatch');
    const services = createLogisticsServices(runtime);
    const { shipment: ready, vehicles: readyVehicles } = await shipmentAndVehicle(runtime, 'ready');
    const { shipment: active, vehicles: activeVehicles } = await shipmentAndVehicle(
      runtime,
      'in-transit'
    );
    const before = await runtime.db.shipments.orderBy('id').toArray();
    const otherVehicle = activeVehicles.find((vehicle) => vehicle.id !== active.vehicleId);
    if (!otherVehicle) throw new Error('active shipment has a replacement vehicle');
    await runtime.session.switchActor('user_0004');

    await expect(
      services.dispatch({ shipmentId: ready.id, vehicleId: readyVehicles[0]!.id })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.reassign(active.id, otherVehicle.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await runtime.db.shipments.orderBy('id').toArray()).toEqual(before);
  });

  it('surfaces offline failures for dispatch and reassignment without writes', async () => {
    fresh();
    const runtime = await harness.boot('network-offline');
    const services = createLogisticsServices(runtime);
    const { shipment: ready, vehicles: readyVehicles } = await shipmentAndVehicle(runtime, 'ready');
    const { shipment: active, vehicles: activeVehicles } = await shipmentAndVehicle(
      runtime,
      'in-transit'
    );
    const before = await runtime.db.shipments.orderBy('id').toArray();
    const otherVehicle = activeVehicles.find((vehicle) => vehicle.id !== active.vehicleId);
    if (!otherVehicle) throw new Error('active shipment has a replacement vehicle');

    await expect(
      services.dispatch({ shipmentId: ready.id, vehicleId: readyVehicles[0]!.id })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    await expect(services.reassign(active.id, otherVehicle.id)).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.shipments.orderBy('id').toArray()).toEqual(before);
  });
});
