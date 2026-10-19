import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type GeoPoint = { lat: number; lng: number };
export type Depot = { id: string; name: string; point: GeoPoint; capacity: number };
export type Vehicle = {
  id: string;
  name: string;
  depotId: string;
  capacity: number;
  driverId: string;
};
export type ShipmentStatus = 'ready' | 'in-transit' | 'delivered';
export type Shipment = {
  id: string;
  reference: string;
  description: string;
  depotId: string;
  vehicleId: string | null;
  destination: GeoPoint;
  route: GeoPoint[];
  status: ShipmentStatus;
  createdAt: string;
  dispatchedAt: string | null;
  dueAt: string;
};
export type LogisticsDatabase = Dexie & {
  depots: EntityTable<Depot, 'id'>;
  vehicles: EntityTable<Vehicle, 'id'>;
  shipments: EntityTable<Shipment, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        depots: 'id, name',
        vehicles: 'id, depotId, driverId',
        shipments: 'id, reference, depotId, vehicleId, status, dueAt, [status+dueAt]',
      },
    },
  ],
};
