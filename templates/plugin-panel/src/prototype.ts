import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generatePluginWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generatePluginWorld,
  /** v2: personas carry library avatars (`av-NNN`), shown as photos. */
  generatorVersion: 2,
  integrity: {
    relations: {
      connectedItems: {},
      settings: {},
    },
    timestamps: { connectedItems: ['connectedAt', 'updatedAt'], settings: ['updatedAt'] },
  },
});
