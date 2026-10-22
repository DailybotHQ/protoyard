import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateDesignKitWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** Wires protoyard.json to this prototype's schema, policy, scenarios and generator. */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateDesignKitWorld,
  generatorVersion: 1,
  integrity: {
    relations: { reviews: { personaId: 'py_personas' } },
    timestamps: { reviews: ['updatedAt'] },
  },
});
