import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { generateSaasWorld } from '@protoyard/saas';
import { generateTeam } from '@protoyard/scenarios';
import type {
  Listing,
  MarketplaceOrder,
  MarketplacePayout,
  SellerProfile,
} from '../database/schema.ts';
import { MARKETPLACE_MEMBER_ROLES } from './index.ts';

export const MARKETPLACE_GENERATOR_VERSION = 1;

const SAMPLE_LISTINGS = [
  {
    title: 'Field Notes Planner',
    category: 'Stationery',
    priceCents: 2400,
    description:
      'A calm weekly planner with room for priorities, notes, and a little breathing space.',
  },
  {
    title: 'Hand-thrown Ceramic Mug',
    category: 'Home',
    priceCents: 3800,
    description: 'A speckled stoneware mug shaped and glazed by a small independent studio.',
  },
  {
    title: 'Canvas Market Tote',
    category: 'Accessories',
    priceCents: 5200,
    description:
      'A sturdy everyday tote sewn from heavyweight cotton canvas with reinforced handles.',
  },
  {
    title: 'Walnut Desk Stand',
    category: 'Workspace',
    priceCents: 7600,
    description: 'A compact walnut stand that keeps a phone visible and a desk uncluttered.',
  },
];

export function generateMarketplaceWorld(ctx: GenerateContext): WorldSeed {
  const team = generateTeam(ctx, { roles: MARKETPLACE_MEMBER_ROLES });
  const saas = generateSaasWorld(ctx, { team });
  const sellers = team.memberships
    .filter((membership) => membership.role === 'seller')
    .map((membership) => team.personas.find((persona) => persona.id === membership.personaId))
    .filter((persona) => persona !== undefined);
  const buyers = team.personas.filter(
    (persona) => !sellers.some((seller) => seller.id === persona.id)
  );
  const sellerProfiles: SellerProfile[] = sellers.map((persona) => ({
    id: persona.id,
    personaId: persona.id,
    storeName: `${persona.name.split(' ')[0] ?? 'Local'} Studio`,
    bio: 'Independent maker sharing thoughtful, small-batch goods with the Fieldmarket community.',
    payoutEmail: `payout-${persona.id}@example.com`,
    status: 'active',
    createdAt: persona.joinedAt,
    updatedAt: persona.joinedAt,
  }));
  const organization = saas.organizations.find((row) => row.id === team.organization.id);
  if (!organization) throw new Error('Marketplace generator needs its primary organization.');
  const maxAgeDays = Math.max(
    0,
    Math.floor((ctx.time.now.getTime() - Date.parse(organization.createdAt)) / 86_400_000)
  );
  const listings: Listing[] = SAMPLE_LISTINGS.map((sample, index) => {
    const owner = sellers[index % Math.max(sellers.length, 1)];
    if (!owner) throw new Error('Marketplace scenarios need at least one seller persona.');
    const createdAt = ctx.time.iso(ctx.time.daysAgo(ctx.rng.int(0, maxAgeDays)));
    return {
      id: ctx.ids.next('listing'),
      sellerPersonaId: owner.id,
      ...sample,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    };
  });
  const buyer = buyers[0];
  const listing = listings[0];
  const orders: MarketplaceOrder[] =
    buyer && listing
      ? [
          {
            id: ctx.ids.next('market-order'),
            listingId: listing.id,
            buyerPersonaId: buyer.id,
            sellerPersonaId: listing.sellerPersonaId,
            quantity: 1,
            unitPriceCents: listing.priceCents,
            totalCents: listing.priceCents,
            sellerPayoutCents: Math.floor((listing.priceCents * 85) / 100),
            platformFeeCents: listing.priceCents - Math.floor((listing.priceCents * 85) / 100),
            status: 'paid',
            createdAt: ctx.time.iso(ctx.time.daysAgo(Math.min(2, maxAgeDays))),
          },
        ]
      : [];
  const payouts: MarketplacePayout[] = orders.map((order) => ({
    id: ctx.ids.next('payout'),
    orderId: order.id,
    sellerPersonaId: order.sellerPersonaId,
    amountCents: order.sellerPayoutCents,
    status: 'pending',
    createdAt: order.createdAt,
  }));

  return {
    ...saas,
    tables: {
      ...saas.tables,
      seller_profiles: sellerProfiles,
      listings,
      marketplace_orders: orders,
      marketplace_payouts: payouts,
    },
  };
}
