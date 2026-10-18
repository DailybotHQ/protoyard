import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { GENERATOR_VERSION, generateConsoleWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** Wires protoyard.json to this prototype's schema, policy, scenarios and generator. */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateConsoleWorld,
  generatorVersion: GENERATOR_VERSION,
  integrity: {
    relations: {
      agents: { ownerId: 'py_personas' },
      runs: { agentId: 'agents', actorId: 'py_personas', evaluationId: 'evaluations' },
      datasets: { agentId: 'agents', ownerId: 'py_personas' },
      evaluations: { agentId: 'agents', datasetId: 'datasets', actorId: 'py_personas' },
    },
    timestamps: {
      agents: ['createdAt', 'updatedAt'],
      runs: ['createdAt'],
      datasets: ['createdAt', 'updatedAt'],
      evaluations: ['createdAt'],
    },
  },
});
