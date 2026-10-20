import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateMonitoringWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';
import { applyMonitoringEvent, monitoringTimeline } from './scenarios/timeline.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateMonitoringWorld,
  generatorVersion: 1,
  timeline: monitoringTimeline,
  applyEvent: applyMonitoringEvent,
  integrity: {
    relations: {
      devices: { ownerId: 'py_personas' },
      telemetry: { deviceId: 'devices' },
      alerts: { deviceId: 'devices', telemetryId: 'telemetry' },
      incidents: { deviceId: 'devices' },
    },
    timestamps: {
      telemetry: ['at'],
      alerts: ['createdAt', 'acknowledgedAt', 'resolvedAt'],
      incidents: ['openedAt', 'updatedAt'],
    },
  },
});
