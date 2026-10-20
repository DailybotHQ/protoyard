import type { GenerateContext, Row, WorldSeed } from '@protoyard/core';
import { generateCrudWorld } from '../generated/scenarios.ts';

const DAY_MS = 86_400_000;
const SHIPMENT_STATES = ['queued', 'dispatched', 'in-transit', 'delayed', 'delivered'] as const;
const CARGO_TYPES = ['containers', 'produce', 'machinery', 'medical-supplies'] as const;
const PRIORITIES = ['standard', 'expedited', 'urgent'] as const;
const ORIGINS = ['North Pier', 'Harbor East', 'Old Quay', 'West Channel', 'Marina Point'] as const;
const DRIVER_NAMES = [
  'Mira Solis',
  'Owen Park',
  'Leila Chen',
  'Rafael Soto',
  'Nia Brooks',
  'Eli Navarro',
] as const;
const VEHICLE_UNITS = ['HL-14', 'HL-22', 'HL-31', 'HL-38', 'HL-42', 'HL-57'] as const;
const DEPOT_NAMES = [
  'North Pier Depot',
  'Harbor East Yard',
  'Old Quay Freight',
  'West Channel Depot',
] as const;

/** Add a small, deterministic dispatch sample to the blueprint-generated world. */
export async function generateHarborWorld(ctx: GenerateContext): Promise<WorldSeed> {
  const world = await generateCrudWorld(ctx);
  const drivers = (world.tables.drivers ?? []).map((row, index) => ({
    ...row,
    name: DRIVER_NAMES[index % DRIVER_NAMES.length] ?? DRIVER_NAMES[0],
  }));
  const vehicles = (world.tables.vehicles ?? []).map((row, index) => ({
    ...row,
    unit: VEHICLE_UNITS[index % VEHICLE_UNITS.length] ?? VEHICLE_UNITS[0],
  }));
  const depots = (world.tables.depots ?? []).map((row, index) => ({
    ...row,
    name: DEPOT_NAMES[index % DEPOT_NAMES.length] ?? DEPOT_NAMES[0],
  }));
  const driverMemberships = world.memberships.filter((membership) => membership.role === 'member');
  const fallbackAssignee = world.memberships[0]?.personaId ?? ctx.scenario.actor.id;
  const referenceMs = ctx.time.now.getTime();
  const shipments = (world.tables.shipments ?? []).map((row, index) => {
    const startMs = referenceMs + ((index % 7) - 2) * DAY_MS + 8 * 60 * 60 * 1000;
    const durationHours = [2, 3, 4, 5][index % 4] ?? 2;
    const driver = drivers[index % Math.max(drivers.length, 1)];
    const vehicle = vehicles[index % Math.max(vehicles.length, 1)];
    const depot = depots[index % Math.max(depots.length, 1)];
    return {
      ...row,
      trackingCode: `HB-${4100 + index}`,
      status: SHIPMENT_STATES[index % SHIPMENT_STATES.length] ?? SHIPMENT_STATES[0],
      cargoType: CARGO_TYPES[index % CARGO_TYPES.length] ?? CARGO_TYPES[0],
      priority: PRIORITIES[index % PRIORITIES.length] ?? PRIORITIES[0],
      origin: ORIGINS[index % ORIGINS.length] ?? ORIGINS[0],
      plannedStart: new Date(startMs).toISOString(),
      plannedEnd: new Date(startMs + durationHours * 60 * 60 * 1000).toISOString(),
      ...(driver ? { driver: driver.id } : {}),
      ...(vehicle ? { vehicle: vehicle.id } : {}),
      ...(depot ? { depot: depot.id } : {}),
      assignedTo:
        driverMemberships[index % Math.max(driverMemberships.length, 1)]?.personaId ??
        fallbackAssignee,
    } satisfies Row;
  });

  return {
    ...world,
    tables: { ...world.tables, shipments, drivers, vehicles, depots },
  };
}

export { generateHarborWorld as generate };
