import { deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { blueprint } from './generated/blueprint.ts';
import { harborlightDispatchTheme } from './generated/brand-theme.ts';
import { policy } from './generated/policy.ts';
import { generate } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate,
  // Bumped via blueprint generator hash when the blueprint changes.
  generatorVersion: 1,
  integrity: deriveIntegrity(blueprint),
  themes: [harborlightDispatchTheme],
});
