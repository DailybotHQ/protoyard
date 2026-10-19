import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool, geoPoints } from '@protoyard/scenarios';
import { routeLength } from '@protoyard/views/map';
import type { Depot, Shipment, Vehicle } from '../database/schema.ts';

const CAST = [
  { id: 'user_0001', name: 'Avery Stone', role: 'owner', title: 'Dispatch lead' },
  { id: 'user_0002', name: 'Morgan Reed', role: 'dispatcher', title: 'Route coordinator' },
  { id: 'user_0003', name: 'Riley Park', role: 'driver', title: 'Fleet driver' },
  { id: 'user_0004', name: 'Casey Lane', role: 'viewer', title: 'Operations observer' },
] as const;

/** Seeded depots and stops use only the fictional harbor-bay ocean region. */
export function generateLogisticsWorld(ctx: GenerateContext): WorldSeed {
  const now = ctx.time.now.toISOString();
  const organization: Organization = {
    id: ctx.scenario.organization.id,
    name: ctx.scenario.organization.name ?? 'Harbor Dispatch',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: ctx.time.iso(ctx.time.daysAgo(ctx.scenario.organization.ageDays)),
    size: CAST.length,
    featureFlags: {},
  };
  const avatars = createAvatarPool(ctx.rng.fork('logistics:avatars'));
  const personas: Persona[] = CAST.map((person, index) => ({
    id: person.id,
    name: person.name,
    title: person.title,
    avatar: avatars.next(),
    email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
    avatarColor: ['#2563eb', '#7c3aed', '#059669', '#d97706'][index] ?? '#475569',
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: ctx.time.iso(
      ctx.time.daysAgo(Math.min(ctx.scenario.organization.ageDays, index * 2))
    ),
    onboardingComplete: true,
    preferences: {},
    summary: person.title,
  }));
  const memberships: Membership[] = CAST.map((person, i) => ({
    id: `membership_${String(i + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.role,
    joinedAt: personas[i]?.joinedAt ?? now,
    capabilities: [],
  }));
  const points = geoPoints({
    ctx,
    region: 'harbor-bay',
    count: 12,
    key: 'logistics-stops',
    spread: 0.12,
  });
  const depotPoints = geoPoints({
    ctx,
    region: 'harbor-bay',
    count: 2,
    key: 'logistics-depots',
    spread: 0.03,
  });
  const depots: Depot[] = [
    {
      id: 'depot_north',
      name: 'North Pier depot',
      point: { lat: depotPoints[0]?.lat ?? -30.4, lng: depotPoints[0]?.lng ?? -18.6 },
      capacity: 18,
    },
    {
      id: 'depot_oldmill',
      name: 'Old Mill depot',
      point: { lat: depotPoints[1]?.lat ?? -31.1, lng: -19.2 },
      capacity: 12,
    },
  ];
  const northDepot = depots[0];
  const oldMillDepot = depots[1];
  if (!northDepot || !oldMillDepot) throw new Error('The logistics template requires two depots.');
  const vehicles: Vehicle[] = [
    {
      id: 'vehicle_01',
      name: 'Blue Heron',
      depotId: northDepot.id,
      capacity: 8,
      driverId: 'user_0003',
    },
    {
      id: 'vehicle_02',
      name: 'Tide Runner',
      depotId: oldMillDepot.id,
      capacity: 6,
      driverId: 'user_0002',
    },
    {
      id: 'vehicle_03',
      name: 'Harbor Kite',
      depotId: northDepot.id,
      capacity: 5,
      driverId: 'user_0002',
    },
    {
      id: 'vehicle_04',
      name: 'Lantern Van',
      depotId: oldMillDepot.id,
      capacity: 4,
      driverId: 'user_0003',
    },
  ];
  const requested = Number(ctx.scenario.generators.shipments ?? 8);
  const count = Math.max(0, Math.min(24, Number.isFinite(requested) ? Math.floor(requested) : 0));
  const shipments: Shipment[] = Array.from({ length: count }, (_, i) => {
    const destination = points[i + 2] ?? points[2] ?? { lat: -30.4, lng: -18.6 };
    const depot = i % 2 === 0 ? northDepot : oldMillDepot;
    const via = points[(i + 4) % points.length] ?? destination;
    const dispatched = i % 4 !== 0;
    const route = [
      depot.point,
      { lat: via.lat, lng: via.lng },
      { lat: destination.lat, lng: destination.lng },
    ];
    const travelMs = (routeLength(route) / (32 / 3.6)) * 1000;
    const started = new Date(ctx.time.now.getTime() - (dispatched ? travelMs * 0.25 : 0));
    return {
      id: `shipment_${String(i + 1).padStart(4, '0')}`,
      reference: `HB-${String(4100 + i)}`,
      description:
        ['Medical supplies', 'Harbor equipment', 'Cold-chain parcel', 'Workshop parts'][i % 4] ??
        'Freight',
      depotId: depot.id,
      vehicleId: dispatched ? (vehicles[i % vehicles.length]?.id ?? null) : null,
      destination: { lat: destination.lat, lng: destination.lng },
      route,
      status: dispatched ? 'in-transit' : 'ready',
      createdAt: ctx.time.iso(ctx.time.daysAgo(1 + (i % 5))),
      dispatchedAt: dispatched ? started.toISOString() : null,
      dueAt: ctx.time.now.toISOString(),
    };
  });
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { depots, vehicles, shipments },
  };
}
