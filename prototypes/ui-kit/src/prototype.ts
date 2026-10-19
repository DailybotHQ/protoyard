import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateUiKitWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateUiKitWorld,
  /** v2: personas carry library avatars (`av-NNN`), shown as photos. (v1 was implicit.) */
  generatorVersion: 2,
  integrity: {
    relations: { favorites: { personaId: 'py_personas' } },
    timestamps: { favorites: ['createdAt'] },
  },
});
