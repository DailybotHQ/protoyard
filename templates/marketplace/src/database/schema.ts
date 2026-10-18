import type { DatabaseDefinition } from '@protoyard/core';
import { saasStores } from '@protoyard/saas';
import type { Dexie, EntityTable } from 'dexie';

export type SellerProfile = {
  id: string;
  personaId: string;
  storeName: string;
  bio: string;
  payoutEmail: string;
  status: 'active';
  createdAt: string;
  updatedAt: string;
};

export type Listing = {
  id: string;
  sellerPersonaId: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  status: 'active' | 'draft' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceOrder = {
  id: string;
  listingId: string;
  buyerPersonaId: string;
  sellerPersonaId: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sellerPayoutCents: number;
  platformFeeCents: number;
  status: 'paid' | 'declined';
  createdAt: string;
};

export type MarketplacePayout = {
  id: string;
  orderId: string;
  sellerPersonaId: string;
  amountCents: number;
  status: 'pending';
  createdAt: string;
};

export type MarketplaceDatabase = Dexie & {
  seller_profiles: EntityTable<SellerProfile, 'id'>;
  listings: EntityTable<Listing, 'id'>;
  marketplace_orders: EntityTable<MarketplaceOrder, 'id'>;
  marketplace_payouts: EntityTable<MarketplacePayout, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        ...saasStores(1),
        seller_profiles: 'id, personaId, status',
        listings: 'id, sellerPersonaId, status, category, createdAt',
        marketplace_orders: 'id, buyerPersonaId, sellerPersonaId, listingId, status, createdAt',
        marketplace_payouts: 'id, orderId, sellerPersonaId, status, createdAt',
      },
    },
  ],
};
