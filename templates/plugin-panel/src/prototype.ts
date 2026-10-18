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
  generatorVersion: 1,
  integrity: {
    relations: {
      connectedItems: {},
      settings: {},
    },
    timestamps: { connectedItems: ['connectedAt', 'updatedAt'], settings: ['updatedAt'] },
  },
});
