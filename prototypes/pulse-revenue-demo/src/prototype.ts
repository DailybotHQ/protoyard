import { blueprintGeneratorVersion, deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { blueprint } from './generated/blueprint.ts';
import { pulseRevenueTheme } from './generated/brand-theme.ts';
import { policy } from './generated/policy.ts';
import { generate } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate,
  // Changes whenever the blueprint's generative surface or the generator SDK does.
  generatorVersion: blueprintGeneratorVersion(blueprint),
  integrity: deriveIntegrity(blueprint),
  themes: [pulseRevenueTheme],
});
