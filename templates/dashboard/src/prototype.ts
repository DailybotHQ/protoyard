import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { DASHBOARD_GENERATOR_VERSION, generateDashboardWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to this prototype's schema, policy, scenarios and
 * generator. Read this file first: schema → policy → scenarios → generator.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateDashboardWorld,
  generatorVersion: DASHBOARD_GENERATOR_VERSION,
  integrity: {
    relations: {
      customers: { ownerId: 'py_personas' },
      orders: { customerId: 'customers' },
      events: { customerId: 'customers', orderId: 'orders', actorId: 'py_personas' },
      settings: { updatedBy: 'py_personas' },
    },
    timestamps: {
      customers: ['createdAt'],
      orders: ['createdAt', 'updatedAt'],
      events: ['at'],
    },
  },
});
