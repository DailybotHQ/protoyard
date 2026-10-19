import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateMobileWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** Wires protoyard.json to this prototype's schema, policy, scenarios and generator. */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateMobileWorld,
  // Bump when generators.ts changes what a seed produces.
  /** v2: personas carry library avatars (`av-NNN`), shown as photos. */
  generatorVersion: 2,
  integrity: {
    relations: { items: { ownerId: 'py_personas' } },
    timestamps: { items: ['createdAt', 'updatedAt'] },
  },
});
