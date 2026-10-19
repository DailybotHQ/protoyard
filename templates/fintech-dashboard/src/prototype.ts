import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateFintechWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateFintechWorld,
  generatorVersion: 1,
  integrity: {
    relations: {
      accounts: { ownerId: 'py_personas' },
      transactions: { accountId: 'accounts', relatedAccountId: 'accounts' },
      balanceSnapshots: { accountId: 'accounts' },
    },
    timestamps: {
      accounts: ['createdAt'],
      transactions: ['occurredAt'],
      balanceSnapshots: ['at'],
    },
  },
});
