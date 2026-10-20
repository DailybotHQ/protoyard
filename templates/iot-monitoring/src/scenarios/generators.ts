import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool, geoPoints, timeSeries } from '@protoyard/scenarios';
import type { Alert, Device, Incident, Telemetry } from '../database/schema.ts';

const PEOPLE = [
  { id: 'user_0001', name: 'Avery Stone', title: 'Reliability lead', role: 'owner' },
  { id: 'user_0002', name: 'Morgan Reed', title: 'Field operator', role: 'operator' },
  { id: 'user_0003', name: 'Riley Park', title: 'Device technician', role: 'technician' },
  { id: 'user_0004', name: 'Casey Lane', title: 'Operations observer', role: 'viewer' },
] as const;
const KINDS = [
  { kind: 'temperature', unit: '°C', baseline: 22, threshold: 26 },
  { kind: 'pressure', unit: 'kPa', baseline: 101.3, threshold: 116 },
  { kind: 'vibration', unit: 'mm/s', baseline: 3.2, threshold: 4.8 },
] as const;
type MonitoringOptions = {
  devices?: number;
  historyDays?: number;
  quiet?: boolean;
  storm?: boolean;
};
const optionsFor = (ctx: GenerateContext): Required<MonitoringOptions> => {
  const raw = (ctx.scenario.generators.monitoring ?? {}) as MonitoringOptions;
  return {
    devices: Math.max(0, Math.min(1_000, Math.floor(raw.devices ?? 12))),
    historyDays: Math.max(1, Math.min(60, Math.floor(raw.historyDays ?? 14))),
    quiet: raw.quiet ?? false,
    storm: raw.storm ?? false,
  };
};

export function generateMonitoringWorld(ctx: GenerateContext): WorldSeed {
  const options = optionsFor(ctx);
  const scenario = ctx.scenario;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northstar Field Systems',
    type: 'company',
    plan: 'standard',
    billingStatus: 'active',
    featureFlags: {},
    createdAt: ctx.time.iso(ctx.time.daysAgo(scenario.organization.ageDays)),
    size: PEOPLE.length,
  };
  const avatars = createAvatarPool(ctx.rng.fork('iot-monitoring:avatars'));
  const personas: Persona[] = PEOPLE.map((person, index) => {
    const role = person.id === scenario.actor.id ? scenario.actor.role : person.role;
    const joinedAt = ctx.time.iso(
      ctx.time.daysAgo(Math.min(scenario.organization.ageDays, index * 12))
    );
    return {
      id: person.id,
      name: person.name,
      title: person.title,
      avatar: avatars.next(),
      email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
      avatarColor: ['#2563eb', '#7c3aed', '#059669', '#d97706'][index] ?? '#475569',
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${person.title} · ${role}`,
    };
  });
  const memberships: Membership[] = PEOPLE.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.id === scenario.actor.id ? scenario.actor.role : person.role,
    joinedAt: personas[index]?.joinedAt ?? organization.createdAt,
    capabilities: [],
  }));
  const points = geoPoints({
    ctx,
    region: 'harbor-bay',
    count: options.devices,
    key: 'iot-devices',
    spread: 0.15,
  });
  const devices: Device[] = Array.from({ length: options.devices }, (_, index) => {
    const profile = KINDS[index % KINDS.length] ?? KINDS[0];
    const point = points[index] ?? { lat: -30.4, lng: -18.6 };
    return {
      id: `device_${String(index + 1).padStart(4, '0')}`,
      name: `${['North', 'Pier', 'Harbor', 'Beacon', 'Tide', 'Quay'][index % 6]} ${profile.kind} ${String(index + 1).padStart(2, '0')}`,
      kind: profile.kind,
      point,
      unit: profile.unit,
      baseline: profile.baseline,
      threshold: options.quiet ? profile.baseline * 1.8 : profile.threshold,
      ownerId: PEOPLE[index % PEOPLE.length]?.id ?? PEOPLE[0].id,
      status: index % 13 === 0 ? 'maintenance' : index % 17 === 0 ? 'offline' : 'online',
    };
  });
  const telemetry: Telemetry[] = [];
  const alerts: Alert[] = [];
  const incidents: Incident[] = [];
  for (const [deviceIndex, device] of devices.entries()) {
    const pointsForDevice = timeSeries({
      ctx,
      key: `iot-device:${device.id}`,
      days: options.historyDays,
      to: ctx.time.now,
      base: device.baseline,
      trend: 'flat',
      seasonality: 'weekly',
      noise: options.quiet ? 0.03 : 0.18,
      min: device.baseline * 0.65,
      max: device.baseline * (options.quiet ? 1.05 : 1.65),
      integer: false,
    });
    const latestAt = pointsForDevice.at(-1)?.at ?? ctx.time.now.toISOString();
    for (const point of pointsForDevice) {
      const forceBreach =
        !options.quiet &&
        ((scenario.id === 'active' && deviceIndex === 0 && point.at === latestAt) ||
          (options.storm && deviceIndex < 4 && point.at === latestAt));
      const value = forceBreach
        ? device.threshold * (deviceIndex % 2 === 0 ? 1.22 : 1.08)
        : point.value;
      telemetry.push({
        id: `${device.id}:${point.at.slice(0, 10)}`,
        deviceId: device.id,
        at: point.at,
        value: Math.round(value * 100) / 100,
        threshold: device.threshold,
        breached: value >= device.threshold,
      });
    }
    const latest = telemetry.at(-1);
    if (latest?.deviceId === device.id && latest.breached) {
      const alertId = `alert:${device.id}:${latest.at.slice(0, 10)}`;
      alerts.push({
        id: alertId,
        deviceId: device.id,
        telemetryId: latest.id,
        severity: latest.value >= device.threshold * 1.2 ? 'critical' : 'warning',
        status: 'open',
        message: `${device.name} exceeded ${device.threshold} ${device.unit}`,
        createdAt: latest.at,
        acknowledgedAt: null,
        resolvedAt: null,
      });
      incidents.push({
        id: `incident:${device.id}`,
        deviceId: device.id,
        title: `${device.name} threshold event`,
        status: 'investigating',
        openedAt: latest.at,
        updatedAt: latest.at,
        normalSamples: 0,
        activeAlertId: alertId,
      });
    }
  }
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { devices, telemetry, alerts, incidents },
  };
}
