import { definePrototype, parseManifest } from '@protoyard/core';
import { billingTimeline, mergeIntegrity, saasScenarioIntegrity } from '@protoyard/saas';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { B2B_SAAS_GENERATOR_VERSION, generateB2bSaasWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateB2bSaasWorld,
  generatorVersion: B2B_SAAS_GENERATOR_VERSION,
  auth: { signedOutByDefault: true },
  timeline: billingTimeline,
  integrity: mergeIntegrity(saasScenarioIntegrity(), {
    relations: { projects: { organizationId: 'py_organizations', ownerPersonaId: 'py_personas' } },
    timestamps: { projects: ['createdAt', 'updatedAt'] },
  }),
});
