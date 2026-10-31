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
  // 2: worlds include a seeded screen sketch.
  generatorVersion: 2,
  integrity: {
    relations: { reviews: { personaId: 'py_personas' }, sketches: { updatedBy: 'py_personas' } },
    timestamps: { reviews: ['updatedAt'], sketches: ['updatedAt'] },
  },
});
