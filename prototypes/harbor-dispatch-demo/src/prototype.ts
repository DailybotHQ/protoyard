import { blueprintGeneratorVersion, deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { blueprint } from './generated/blueprint.ts';
import { harborlightDispatchTheme } from './generated/brand-theme.ts';
import { policy } from './generated/policy.ts';
import { generate } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** Bump when the enrichment in scenarios/generators.ts can change the world. */
const ENRICHMENT_VERSION = 1;

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate,
  // The blueprint generator's version plus the dispatch enrichment's own.
  generatorVersion: blueprintGeneratorVersion(blueprint) + ENRICHMENT_VERSION,
  integrity: deriveIntegrity(blueprint),
  themes: [harborlightDispatchTheme],
});
