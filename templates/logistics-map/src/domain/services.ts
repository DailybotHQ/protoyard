import { type PrototypeRuntime, ValidationError as RuntimeValidationError } from '@protoyard/core';
import { routeLength } from '@protoyard/views/map';
import { z } from 'zod';
import type { LogisticsDatabase, Shipment } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

const Id = z.string().min(1).max(80);
const DispatchInput = z.object({ shipmentId: Id, vehicleId: Id });

export function createLogisticsServices(runtime: PrototypeRuntime<LogisticsDatabase>) {
  const { db, session, environment, clock } = runtime;
  return {
    async dispatch(input: { shipmentId: string; vehicleId: string }): Promise<void> {
      session.assert(CAPABILITIES.manage);
      const parsed = DispatchInput.safeParse(input);
      if (!parsed.success)
        throw new RuntimeValidationError({ shipmentId: 'Choose a shipment and vehicle.' });
      await environment.run('dispatch.shipment', () =>
        db.transaction('rw', db.shipments, db.vehicles, async () => {
          const shipment = await db.shipments.get(parsed.data.shipmentId);
          const vehicle = await db.vehicles.get(parsed.data.vehicleId);
          if (!shipment)
            throw new RuntimeValidationError({ shipmentId: 'This shipment no longer exists.' });
          if (!vehicle || vehicle.depotId !== shipment.depotId)
            throw new RuntimeValidationError({
              vehicleId: 'Choose a vehicle assigned to this depot.',
            });
          if (shipment.status !== 'ready')
            throw new RuntimeValidationError({
              shipmentId: 'Only ready shipments can be dispatched.',
            });
          const dispatchedAt = clock.now();
          const travelMs = (routeLength(shipment.route) / (32 / 3.6)) * 1000;
          await db.shipments.update(shipment.id, {
            vehicleId: vehicle.id,
            status: 'in-transit',
            dispatchedAt: dispatchedAt.toISOString(),
            dueAt: new Date(dispatchedAt.getTime() + travelMs).toISOString(),
            deliveredAt: null,
          });
        })
      );
    },
    async reassign(shipmentId: string, vehicleId: string): Promise<void> {
      session.assert(CAPABILITIES.manage);
      const id = Id.safeParse(shipmentId);
      const vId = Id.safeParse(vehicleId);
      if (!id.success || !vId.success)
        throw new RuntimeValidationError({ shipmentId: 'Choose a shipment and vehicle.' });
      await environment.run('dispatch.reassign', () =>
        db.transaction('rw', db.shipments, db.vehicles, async () => {
          const shipment = (await db.shipments.get(id.data)) as Shipment | undefined;
          const vehicle = await db.vehicles.get(vId.data);
          if (shipment?.status !== 'in-transit')
            throw new RuntimeValidationError({
              shipmentId: 'Only active shipments can be reassigned.',
            });
          if (!vehicle || vehicle.depotId !== shipment.depotId)
            throw new RuntimeValidationError({
              vehicleId: 'Choose a vehicle assigned to this depot.',
            });
          await db.shipments.update(shipment.id, { vehicleId: vehicle.id });
        })
      );
    },
  };
}
