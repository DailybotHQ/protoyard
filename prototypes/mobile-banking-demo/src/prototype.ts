import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateBankWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Lumen Bank wiring: schema → policy → scenarios → generator. There is no
 * timeline here on purpose: time travel is preview-only for this prototype
 * (the DevTools say so), which shows that `timeline` is optional.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  integrity: {
    relations: {
      accounts: { ownerId: 'py_personas' },
      transactions: { accountId: 'accounts', transferId: 'transfers' },
      beneficiaries: { ownerId: 'py_personas' },
      transfers: {
        fromAccountId: 'accounts',
        toAccountId: 'accounts',
        beneficiaryId: 'beneficiaries',
        createdBy: 'py_personas',
      },
    },
    timestamps: { transactions: ['at'], beneficiaries: ['createdAt'] },
  },
  generate: generateBankWorld,
});
