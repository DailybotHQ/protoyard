import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateLogisticsWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';
import { applyLogisticsEvent, logisticsTimeline } from './scenarios/timeline.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateLogisticsWorld,
  generatorVersion: 1,
  timeline: logisticsTimeline,
  applyEvent: applyLogisticsEvent,
  integrity: {
    relations: {
      vehicles: { depotId: 'depots', driverId: 'py_personas' },
      shipments: { depotId: 'depots', vehicleId: 'vehicles' },
    },
    timestamps: { shipments: ['createdAt', 'dispatchedAt', 'deliveredAt'] },
  },
});
