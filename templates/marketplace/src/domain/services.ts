import type { PrototypeRuntime } from '@protoyard/core';
import { createRuntimeId, parseInput, ValidationError } from '@protoyard/core';
import { createInbox } from '@protoyard/saas';
import { z } from 'zod';
import type {
  Listing,
  MarketplaceDatabase,
  MarketplaceOrder,
  MarketplacePayout,
  SellerProfile,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type CheckoutInput,
  CheckoutInputSchema,
  type ListingInput,
  ListingInputSchema,
  type ListingUpdate,
  ListingUpdateSchema,
  type SellerOnboardingInput,
  SellerOnboardingSchema,
} from './schema.ts';

interface Table<T> {
  add(row: T): Promise<unknown>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  toArray(): Promise<T[]>;
  where(index: string): { equals(value: string): { toArray(): Promise<T[]> } };
}

interface MarketplaceDb {
  table<T>(name: string): Table<T>;
  rows<T>(name: string): Table<T>;
  transaction<T>(mode: 'rw', tables: string[], work: () => Promise<T>): Promise<T>;
}

const TABLES = {
  profiles: 'seller_profiles',
  listings: 'listings',
  orders: 'marketplace_orders',
  payouts: 'marketplace_payouts',
  inbox: 'saas_inbox',
} as const;

export function createMarketplaceServices(runtime: PrototypeRuntime<MarketplaceDatabase>) {
  const db = runtime.db as unknown as MarketplaceDb;
  const inbox = createInbox(runtime);
  const now = () => runtime.clock.now().toISOString();
  const principal = () => {
    const current = runtime.session.principal();
    if (!current) throw new ValidationError({ form: 'Sign in to continue.' });
    return current;
  };
  const sellerProfile = async (personaId: string) =>
    db.table<SellerProfile>(TABLES.profiles).get(personaId);

  return {
    async listings(): Promise<Listing[]> {
      return (await db.table<Listing>(TABLES.listings).toArray())
        .filter((listing) => listing.status === 'active')
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    async myListings(): Promise<Listing[]> {
      const current = principal();
      runtime.session.assert(CAPABILITIES.listingRead);
      return db
        .table<Listing>(TABLES.listings)
        .where('sellerPersonaId')
        .equals(current.persona.id)
        .toArray();
    },

    async sellerProfile(personaId = principal().persona.id): Promise<SellerProfile | undefined> {
      return sellerProfile(personaId);
    },

    async onboardSeller(input: SellerOnboardingInput): Promise<SellerProfile> {
      const current = principal();
      runtime.session.assert(CAPABILITIES.onboardSeller);
      const data = parseInput(SellerOnboardingSchema, input);
      const at = now();
      return runtime.environment.run('seller.onboard', () =>
        db.transaction('rw', [TABLES.profiles], async () => {
          const row: SellerProfile = {
            id: current.persona.id,
            personaId: current.persona.id,
            ...data,
            status: 'active',
            createdAt: (await sellerProfile(current.persona.id))?.createdAt ?? at,
            updatedAt: at,
          };
          await db.table<SellerProfile>(TABLES.profiles).put(row);
          return row;
        })
      );
    },

    async createListing(input: ListingInput): Promise<Listing> {
      const current = principal();
      runtime.session.assert(CAPABILITIES.listingCreate);
      const data = parseInput(ListingInputSchema, input);
      const at = now();
      return runtime.environment.run('listings.create', () =>
        db.transaction('rw', [TABLES.profiles, TABLES.listings], async () => {
          const profile = await sellerProfile(current.persona.id);
          if (profile?.status !== 'active') {
            throw new ValidationError({
              form: 'Complete seller onboarding before publishing a listing.',
            });
          }
          const row: Listing = {
            id: createRuntimeId('listing'),
            sellerPersonaId: current.persona.id,
            ...data,
            createdAt: at,
            updatedAt: at,
          };
          await db.table<Listing>(TABLES.listings).add(row);
          return row;
        })
      );
    },

    async updateListing(input: ListingUpdate): Promise<Listing> {
      principal();
      const lookupId = typeof input?.id === 'string' ? input.id : '';
      const existing = await db.table<Listing>(TABLES.listings).get(lookupId);
      if (!existing) throw new ValidationError({ id: 'Listing not found.' });
      runtime.session.assert(CAPABILITIES.listingUpdate, existing);
      const data = parseInput(ListingUpdateSchema, input);
      return runtime.environment.run('listings.update', () =>
        db.transaction('rw', [TABLES.listings], async () => {
          const latest = await db.table<Listing>(TABLES.listings).get(data.id);
          if (!latest) throw new ValidationError({ id: 'Listing not found.' });
          runtime.session.assert(CAPABILITIES.listingUpdate, latest);
          const updated: Listing = { ...latest, ...data, updatedAt: now() };
          await db.table<Listing>(TABLES.listings).put(updated);
          return updated;
        })
      );
    },

    async removeListing(id: string): Promise<void> {
      principal();
      const lookupId = typeof id === 'string' ? id : '';
      const existing = await db.table<Listing>(TABLES.listings).get(lookupId);
      if (!existing) throw new ValidationError({ id: 'Listing not found.' });
      runtime.session.assert(CAPABILITIES.listingDelete, existing);
      const listingId = parseInput(z.string().min(1), id);
      await runtime.environment.run('listings.delete', () =>
        db.transaction('rw', [TABLES.listings, TABLES.orders], async () => {
          const latest = await db.table<Listing>(TABLES.listings).get(listingId);
          if (!latest) throw new ValidationError({ id: 'Listing not found.' });
          runtime.session.assert(CAPABILITIES.listingDelete, latest);
          const hasOrders =
            (
              await db
                .table<MarketplaceOrder>(TABLES.orders)
                .where('listingId')
                .equals(listingId)
                .toArray()
            ).length > 0;
          if (hasOrders) {
            await db
              .table<Listing>(TABLES.listings)
              .put({ ...latest, status: 'archived', updatedAt: now() });
          } else {
            await db.table<Listing>(TABLES.listings).delete(listingId);
          }
        })
      );
    },

    async checkout(input: CheckoutInput): Promise<MarketplaceOrder> {
      const current = principal();
      runtime.session.assert(CAPABILITIES.orderCreate);
      const data = parseInput(CheckoutInputSchema, input);
      const at = now();
      return runtime.environment.run('marketplace.checkout', () =>
        db.transaction(
          'rw',
          [TABLES.listings, TABLES.orders, TABLES.payouts, TABLES.inbox],
          async () => {
            const listing = await db.table<Listing>(TABLES.listings).get(data.listingId);
            if (listing?.status !== 'active') {
              throw new ValidationError({ listingId: 'This listing is no longer available.' });
            }
            if (listing.sellerPersonaId === current.persona.id) {
              throw new ValidationError({ listingId: 'Choose a listing from another seller.' });
            }
            const totalCents = listing.priceCents * data.quantity;
            const payoutCents =
              data.outcome === 'success' ? Math.floor((totalCents * 85) / 100) : 0;
            const order: MarketplaceOrder = {
              id: createRuntimeId('market-order'),
              listingId: listing.id,
              buyerPersonaId: current.persona.id,
              sellerPersonaId: listing.sellerPersonaId,
              quantity: data.quantity,
              unitPriceCents: listing.priceCents,
              totalCents,
              sellerPayoutCents: payoutCents,
              platformFeeCents: data.outcome === 'success' ? totalCents - payoutCents : 0,
              status: data.outcome === 'success' ? 'paid' : 'declined',
              createdAt: at,
            };
            await db.table<MarketplaceOrder>(TABLES.orders).add(order);
            if (data.outcome === 'success') {
              const payout: MarketplacePayout = {
                id: createRuntimeId('payout'),
                orderId: order.id,
                sellerPersonaId: listing.sellerPersonaId,
                amountCents: payoutCents,
                status: 'pending',
                createdAt: at,
              };
              await db.table<MarketplacePayout>(TABLES.payouts).add(payout);
            }
            const seller = runtime.session
              .personas()
              .find((persona) => persona.id === listing.sellerPersonaId);
            if (current.persona.email) {
              await inbox.write({
                recipient: current.persona.email,
                personaId: current.persona.id,
                kind: 'receipt',
                subject:
                  data.outcome === 'success'
                    ? 'Marketplace order confirmed'
                    : 'Marketplace checkout declined',
                body:
                  data.outcome === 'success'
                    ? `Your simulated order for ${listing.title} totals $${(totalCents / 100).toFixed(2)}. No payment was taken.`
                    : `The simulated checkout for ${listing.title} was declined. No order payment was taken.`,
                action: { label: 'View orders', href: '#/orders' },
              });
            }
            if (data.outcome === 'success' && seller?.email) {
              await inbox.write({
                recipient: seller.email,
                personaId: seller.id,
                kind: 'notification',
                subject: 'New marketplace order',
                body: `${listing.title} sold. A simulated payout of $${(payoutCents / 100).toFixed(2)} is pending.`,
                action: { label: 'View seller orders', href: '#/seller' },
              });
            }
            return order;
          }
        )
      );
    },

    async orders(): Promise<MarketplaceOrder[]> {
      const current = principal();
      runtime.session.assert(CAPABILITIES.orderRead);
      const [asBuyer, asSeller] = await Promise.all([
        db
          .table<MarketplaceOrder>(TABLES.orders)
          .where('buyerPersonaId')
          .equals(current.persona.id)
          .toArray(),
        db
          .table<MarketplaceOrder>(TABLES.orders)
          .where('sellerPersonaId')
          .equals(current.persona.id)
          .toArray(),
      ]);
      return [
        ...new Map([...asBuyer, ...asSeller].map((order) => [order.id, order])).values(),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
