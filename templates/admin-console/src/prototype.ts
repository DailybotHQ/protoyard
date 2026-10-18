import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { ADMIN_GENERATOR_VERSION, generateAdminWorld } from './scenarios/generators.ts';
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
  generate: generateAdminWorld,
  generatorVersion: ADMIN_GENERATOR_VERSION,
  integrity: {
    relations: {
      tenants: { organizationId: 'py_organizations' },
      user_access: { personaId: 'py_personas', tenantId: 'tenants' },
      subscriptions: { tenantId: 'tenants' },
      py_events: { actorId: 'py_personas' },
    },
    timestamps: {
      tenants: ['createdAt', 'suspendedAt', 'updatedAt'],
      user_access: ['lastSeenAt', 'updatedAt'],
      subscriptions: ['createdAt', 'updatedAt'],
    },
  },
});
