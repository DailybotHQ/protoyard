import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateShopWorld, SHOP_GENERATOR_VERSION } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to this prototype's schema, policy, scenarios and
 * generator. Read this file first: schema → policy → scenarios → generator →
 * services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateShopWorld,
  generatorVersion: SHOP_GENERATOR_VERSION,
  integrity: {
    relations: {
      products: { categoryId: 'categories' },
      cartItems: { customerId: 'py_personas', productId: 'products' },
      orders: { customerId: 'py_personas' },
      orderItems: { orderId: 'orders', productId: 'products' },
    },
    timestamps: {
      products: ['createdAt', 'updatedAt'],
      cartItems: ['addedAt'],
      orders: ['placedAt', 'updatedAt'],
    },
  },
});
