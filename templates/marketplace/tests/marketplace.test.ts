import { PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketplaceDatabase } from '../src/database/schema.ts';
import { createMarketplaceServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateMarketplaceWorld } from '../src/scenarios/generators.ts';

const resolved = resolveScenarios(definition.scenarios, PRESETS);
let runtime: PrototypeRuntime<MarketplaceDatabase> | undefined;

afterEach(async () => {
  await runtime?.destroy();
  runtime = undefined;
});

async function boot(scenario: string) {
  runtime = (await createPrototypeRuntime(definition, {
    link: { scenario },
    sleep: async () => {},
  })) as unknown as PrototypeRuntime<MarketplaceDatabase>;
  await runtime.scenarios.ensureSeeded();
  return runtime;
}

describe('marketplace template', () => {
  it('generates deterministic, referentially sound worlds for every scenario', () => {
    for (const scenario of resolved) {
      const first = generateMarketplaceWorld(createGenerateContext(scenario));
      expect(first).toEqual(generateMarketplaceWorld(createGenerateContext(scenario)));
      expect(first.tables.listings).toHaveLength(4);
      expect(
        validateWorld(first, { ...definition.integrity, referenceTime: scenario.referenceTime })
      ).toEqual([]);
      for (const listing of first.tables.listings ?? []) {
        expect(Number.isInteger(listing.priceCents)).toBe(true);
        expect(listing.priceCents).toBeGreaterThan(0);
      }
    }
  });

  it('persists seller listing create, update, and delete operations', async () => {
    const app = await boot('seller-active');
    await app.session.signIn('user_0001');
    const marketplace = createMarketplaceServices(app);
    const listing = await marketplace.createListing({
      title: 'New market basket',
      description: 'A woven basket for fruit, mail, and everyday things.',
      category: 'Home',
      priceCents: 3200,
    });
    expect(listing.sellerPersonaId).toBe('user_0001');
    await marketplace.updateListing({ ...listing, title: 'Updated market basket' });
    expect(await app.db.listings.get(listing.id)).toMatchObject({ title: 'Updated market basket' });
    await marketplace.removeListing(listing.id);
    expect(await app.db.listings.get(listing.id)).toBeUndefined();
  });

  it('prevents a buyer from editing another seller listing', async () => {
    const app = await boot('marketplace');
    await app.session.signIn('user_0001');
    const listing = (await app.db.listings.toArray()).find(
      (row) => row.sellerPersonaId !== 'user_0001'
    );
    expect(listing).toBeDefined();
    await expect(
      createMarketplaceServices(app).updateListing({ ...listing!, title: 'Taken over listing' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('saves seller onboarding and records successful cent-based checkout payouts and inbox notices', async () => {
    const app = await boot('seller-onboarding');
    await app.session.signIn('user_0001');
    const marketplace = createMarketplaceServices(app);
    const profile = await marketplace.onboardSeller({
      storeName: 'Avery Makes',
      bio: 'Small-batch home goods made with care and locally sourced materials.',
      payoutEmail: 'payout-avery@example.com',
    });
    expect(profile).toMatchObject({ personaId: 'user_0001', status: 'active' });
    const listing = (await marketplace.listings())[0];
    if (!listing) throw new Error('Expected a generated sample listing.');
    const order = await marketplace.checkout({
      listingId: listing.id,
      quantity: 2,
      outcome: 'success',
    });
    expect(order.totalCents).toBe(listing.priceCents * 2);
    expect(order.sellerPayoutCents + order.platformFeeCents).toBe(order.totalCents);
    expect(
      await app.db.marketplace_payouts.where('orderId').equals(order.id).first()
    ).toMatchObject({
      amountCents: order.sellerPayoutCents,
      status: 'pending',
    });
    expect((await app.db.table('saas_inbox').toArray()).length).toBeGreaterThanOrEqual(2);
  });
});
