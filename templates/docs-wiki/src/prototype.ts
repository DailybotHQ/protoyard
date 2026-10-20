import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateWikiWorld, WIKI_GENERATOR_VERSION } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to the wiki's schema, policy, scenarios and generator.
 * Read this file first: schema → policy → scenarios → generator → services
 * (src/domain/services.ts) → screens. There is no timeline: pages change only
 * when someone edits them.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateWikiWorld,
  generatorVersion: WIKI_GENERATOR_VERSION,
  integrity: {
    relations: {
      pages: {
        spaceId: 'spaces',
        parentId: 'pages',
        createdBy: 'py_personas',
        updatedBy: 'py_personas',
      },
      versions: { pageId: 'pages', authorId: 'py_personas' },
    },
    timestamps: {
      spaces: ['createdAt'],
      pages: ['createdAt', 'updatedAt'],
      versions: ['at'],
    },
  },
});
