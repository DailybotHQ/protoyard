import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateOnboardingWorld, ONBOARDING_GENERATOR_VERSION } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to this prototype's schema, policy, scenarios and
 * generator. Read this file first: schema → steps → services → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateOnboardingWorld,
  generatorVersion: ONBOARDING_GENERATOR_VERSION,
  integrity: {
    relations: {
      onboarding: { personaId: 'py_personas' },
      workspaces: { updatedBy: 'py_personas' },
      invitations: { invitedBy: 'py_personas' },
    },
    timestamps: {
      onboarding: ['updatedAt'],
      invitations: ['createdAt'],
    },
  },
});
