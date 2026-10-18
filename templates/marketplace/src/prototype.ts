import { definePrototype, parseManifest } from '@protoyard/core';
import { billingTimeline, mergeIntegrity, saasScenarioIntegrity } from '@protoyard/saas';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateMarketplaceWorld, MARKETPLACE_GENERATOR_VERSION } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateMarketplaceWorld,
  generatorVersion: MARKETPLACE_GENERATOR_VERSION,
  auth: { signedOutByDefault: true },
  timeline: billingTimeline,
  integrity: mergeIntegrity(saasScenarioIntegrity(), {
    relations: {
      seller_profiles: { personaId: 'py_personas' },
      listings: { sellerPersonaId: 'py_personas' },
      marketplace_orders: {
        listingId: 'listings',
        buyerPersonaId: 'py_personas',
        sellerPersonaId: 'py_personas',
      },
      marketplace_payouts: { orderId: 'marketplace_orders', sellerPersonaId: 'py_personas' },
    },
    timestamps: {
      seller_profiles: ['createdAt', 'updatedAt'],
      listings: ['createdAt', 'updatedAt'],
      marketplace_orders: ['createdAt'],
      marketplace_payouts: ['createdAt'],
    },
  }),
});
