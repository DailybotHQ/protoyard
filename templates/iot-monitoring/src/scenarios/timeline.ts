import type { DomainEvent, EventApplyContext, TimelineContext } from '@protoyard/core';
import { timeSeries } from '@protoyard/scenarios';
import type { Alert, Device, Incident, Telemetry } from '../database/schema.ts';

interface TelemetryPayload {
  deviceId: string;
  at: string;
  value: number;
}
const DAY_MS = 86_400_000;
const dayStart = (date: Date) => Math.floor(date.getTime() / DAY_MS) * DAY_MS;

/** One stable event for each device and UTC day, regardless of advance-window size. */
export async function monitoringTimeline(
  ctx: TimelineContext
): Promise<DomainEvent<TelemetryPayload>[]> {
  const devices = (await ctx.read('devices')) as unknown as Device[];
  const count = Math.min(
    366,
    Math.max(1, Math.floor((dayStart(ctx.to) - dayStart(ctx.from)) / DAY_MS) + 1)
  );
  const events: DomainEvent<TelemetryPayload>[] = [];
  for (const device of devices) {
    const series = timeSeries({
      ctx,
      key: `iot-device:${device.id}`,
      days: count,
      to: ctx.to,
      base: device.baseline,
      trend: 'flat',
      seasonality: 'weekly',
      noise: 0.18,
      min: device.baseline * 0.65,
      max: device.baseline * 1.65,
      integer: false,
    });
    for (const point of series) {
      const at = Date.parse(point.at);
      if (at <= ctx.from.getTime() || at > ctx.to.getTime()) continue;
      events.push({
        id: `telemetry:${device.id}:${point.at.slice(0, 10)}`,
        type: 'telemetry.recorded',
        at: point.at,
        source: 'timeline',
        payload: { deviceId: device.id, at: point.at, value: Math.round(point.value * 100) / 100 },
      });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function applyMonitoringEvent(
  event: DomainEvent,
  ctx: EventApplyContext
): Promise<void> {
  if (event.type !== 'telemetry.recorded') return;
  const payload = event.payload as TelemetryPayload;
  const device = (await ctx.get('devices', payload.deviceId)) as unknown as Device | undefined;
  if (!device) return;
  const day = payload.at.slice(0, 10);
  const telemetryId = `${device.id}:${day}`;
  const breached = payload.value >= device.threshold;
  const telemetry: Telemetry = {
    id: telemetryId,
    deviceId: device.id,
    at: payload.at,
    value: payload.value,
    threshold: device.threshold,
    breached,
  };
  await ctx.put('telemetry', telemetry);
  const incidentId = `incident:${device.id}`;
  const incident = (await ctx.get('incidents', incidentId)) as unknown as Incident | undefined;
  if (breached) {
    const alertId = `alert:${device.id}:${day}`;
    const alert: Alert = {
      id: alertId,
      deviceId: device.id,
      telemetryId,
      severity: payload.value >= device.threshold * 1.2 ? 'critical' : 'warning',
      status: 'open',
      message: `${device.name} exceeded ${device.threshold} ${device.unit}`,
      createdAt: payload.at,
      acknowledgedAt: null,
      resolvedAt: null,
    };
    await ctx.put('alerts', alert);
    const next: Incident = incident
      ? {
          ...incident,
          title: `${device.name} threshold event`,
          status: 'investigating',
          updatedAt: payload.at,
          normalSamples: 0,
          activeAlertId: alertId,
        }
      : {
          id: incidentId,
          deviceId: device.id,
          title: `${device.name} threshold event`,
          status: 'investigating',
          openedAt: payload.at,
          updatedAt: payload.at,
          normalSamples: 0,
          activeAlertId: alertId,
        };
    await ctx.put('incidents', next);
    return;
  }
  if (!incident || incident.status === 'resolved') return;
  if (incident.activeAlertId) {
    const alert = (await ctx.get('alerts', incident.activeAlertId)) as unknown as Alert | undefined;
    if (alert && alert.status !== 'resolved') {
      await ctx.put('alerts', { ...alert, status: 'resolved', resolvedAt: payload.at });
    }
  }
  const normalSamples = incident.normalSamples + 1;
  await ctx.put('incidents', {
    ...incident,
    status: normalSamples >= 2 ? 'resolved' : 'monitoring',
    updatedAt: payload.at,
    normalSamples,
    activeAlertId: null,
  });
}
