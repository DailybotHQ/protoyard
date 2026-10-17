import type { ScenarioInput } from '@protoyard/core';
import { composeScenario, fragments, presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds composed from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios". `generators.shop` holds the knobs read by
 * `generators.ts` (see `ShopGeneratorOptions`).
 *
 * Every scenario shares the seed, so the catalog is the same store everywhere;
 * scenarios differ in who is shopping, their history, stock and network.
 */

export const REFERENCE_TIME = '2026-10-16T15:00:00.000Z';

/** Knobs the generator reads from `scenario.generators.shop`. */
export interface ShopGeneratorOptions {
  /** Past orders of Chloe (`user_0003`), the featured customer — whoever the actor is. */
  customerOrders: number;
  /** Lines already in Chloe's cart. */
  cartLines: number;
  /** Other customers with orders (for the admin view). */
  otherCustomers: number;
  /** Share of products with only 1–5 units left (0..1). */
  lowStockShare: number;
  /** Products with zero stock. */
  soldOut: number;
  /** One cart line asks for more units than remain (someone bought them meanwhile). */
  cartOverStock: boolean;
}

const base = {
  seed: 5150,
  referenceTime: REFERENCE_TIME,
  organization: { id: 'org_0001', name: 'Fieldnote Supply', size: 4 },
};

const defaults: ShopGeneratorOptions = {
  customerOrders: 6,
  cartLines: 2,
  otherCustomers: 8,
  lowStockShare: 0.1,
  soldOut: 1,
  cartOverStock: false,
};

const returning = presetScenario(
  'active-month',
  base,
  fragments.organizationAge(400),
  fragments.tenure(240),
  fragments.role('member'),
  {
    id: 'returning-customer',
    name: 'Returning customer',
    description:
      'Chloe has shopped here for eight months: six past orders in every status and two items waiting in her cart.',
    group: 'Customers',
    actor: { id: 'user_0003', onboardingComplete: true },
    generators: { shop: defaults },
    tags: ['default'],
  }
);

export const scenarios: ScenarioInput[] = [
  presetScenario(
    'brand-new-signup',
    base,
    fragments.organizationAge(400),
    fragments.role('member'),
    {
      id: 'new-shopper',
      name: 'New shopper',
      description:
        'Chloe just created an account: empty cart, no order history, fully stocked shelves.',
      group: 'Customers',
      density: 'normal',
      activity: { level: 'normal' },
      actor: { id: 'user_0003', onboardingComplete: true },
      generators: {
        shop: { ...defaults, customerOrders: 0, cartLines: 0, soldOut: 0, lowStockShare: 0 },
      },
    }
  ),
  returning,
  composeScenario(returning, {
    id: 'low-stock',
    name: 'Low stock & sold out',
    description:
      'Half the catalog is almost gone, five items are sold out and one cart line now exceeds what is left — checkout must refuse it.',
    group: 'Inventory',
    generators: { shop: { ...defaults, lowStockShare: 0.5, soldOut: 5, cartOverStock: true } },
    tags: ['inventory'],
  }),
  composeScenario(returning, fragments.network('offline'), {
    id: 'offline-checkout',
    name: 'Offline checkout failure',
    description:
      'The network is down: browsing works from local data, but checkout fails with a clear error and nothing is written.',
    group: 'Conditions',
    tags: ['conditions'],
  }),
  composeScenario(returning, {
    id: 'store-admin',
    name: 'Store admin',
    description:
      'Ben manages the store: every customer’s orders, order status and price/stock editing.',
    group: 'Roles',
    actor: { id: 'user_0002', role: 'admin', joinedDaysAgo: 380 },
    tags: ['roles'],
  }),
  composeScenario(returning, {
    id: 'guest-browsing',
    name: 'Guest browsing',
    description:
      'A visitor who has not signed in: can browse and search, but not add to cart or check out.',
    group: 'Roles',
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 0 },
    tags: ['roles'],
  }),
];
