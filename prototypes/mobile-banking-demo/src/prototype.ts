import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { applyBankEvent, bankTimeline } from './domain/timeline.ts';
import { BANK_GENERATOR_VERSION, generateBankWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Lumen Bank wiring: schema → policy → scenarios → generator → timeline.
 * Advancing time commits payroll, rent, auto-save and card purchases through
 * `applyBankEvent` (idempotent: see domain/timeline.ts).
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
  generatorVersion: BANK_GENERATOR_VERSION,
  timeline: bankTimeline,
  applyEvent: applyBankEvent,
});
