import { deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { blueprint } from './generated/blueprint.ts';
import { policy } from './generated/policy.ts';
import { generate } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

const derived = deriveIntegrity(blueprint);

/**
 * SLA deadlines are future instants by design, so `slaDueAt` is left out of
 * the "timestamps lie before the reference time" rule; every other derived
 * relation and timestamp check stays.
 */
const integrity = {
  ...derived,
  timestamps: {
    ...derived.timestamps,
    tickets: (derived.timestamps?.tickets ?? []).filter((column) => column !== 'slaDueAt'),
  },
};

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate,
  // Bump when the enrichment in scenarios/helpdesk.ts can change the world.
  generatorVersion: 2,
  integrity,
});
