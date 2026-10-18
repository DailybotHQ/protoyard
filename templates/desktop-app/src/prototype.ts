import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { DESKTOP_GENERATOR_VERSION, generateDesktopWorld } from './scenarios/generators.ts';
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
  generate: generateDesktopWorld,
  generatorVersion: DESKTOP_GENERATOR_VERSION,
  integrity: {
    relations: {
      documents: { folderId: 'folders', authorId: 'py_personas', updatedBy: 'py_personas' },
    },
    timestamps: {
      folders: ['createdAt', 'updatedAt'],
      tags: ['createdAt'],
      documents: ['createdAt', 'updatedAt'],
    },
  },
});
