# Logistics Map: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Dispatch a ready shipment

1. The dispatcher picks a ready shipment in Live dispatch and chooses the
   vehicle already assigned to its depot.
2. Service: `services.dispatch({ shipmentId, vehicleId })`.
3. Capability: `dispatch:manage`.
4. Writes: shipment `vehicleId`, `status` and `dispatchedAt`.
5. Failure states: validation and permission errors; a simulated offline
   environment rejects the operation before data is written.

## Reassign an active shipment

1. The dispatcher chooses another vehicle at the shipment's depot.
2. Service: `services.reassign(shipmentId, vehicleId)`.
3. Capability: `dispatch:manage`.
4. Writes: shipment `vehicleId`.
5. Failure states: only in-transit shipments and same-depot vehicles are
   accepted; offline errors leave the original vehicle unchanged.
