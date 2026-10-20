import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type GeoPoint = { lat: number; lng: number };
export type Device = {
  id: string;
  name: string;
  kind: 'temperature' | 'pressure' | 'vibration';
  point: GeoPoint;
  unit: '°C' | 'kPa' | 'mm/s';
  baseline: number;
  threshold: number;
  ownerId: string;
  status: 'online' | 'maintenance' | 'offline';
};
export type Telemetry = {
  id: string;
  deviceId: string;
  at: string;
  value: number;
  threshold: number;
  breached: boolean;
};
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type Alert = {
  id: string;
  deviceId: string;
  telemetryId: string;
  severity: 'warning' | 'critical';
  status: AlertStatus;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};
export type IncidentStatus = 'investigating' | 'monitoring' | 'resolved';
export type Incident = {
  id: string;
  deviceId: string;
  title: string;
  status: IncidentStatus;
  openedAt: string;
  updatedAt: string;
  normalSamples: number;
  activeAlertId: string | null;
};

export type MonitoringDatabase = Dexie & {
  devices: EntityTable<Device, 'id'>;
  telemetry: EntityTable<Telemetry, 'id'>;
  alerts: EntityTable<Alert, 'id'>;
  incidents: EntityTable<Incident, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        devices: 'id, name, kind, status, ownerId',
        telemetry: 'id, deviceId, at, breached, [deviceId+at]',
        alerts: 'id, deviceId, telemetryId, status, severity, createdAt, [deviceId+status]',
        incidents: 'id, deviceId, status, updatedAt',
      },
    },
  ],
};
