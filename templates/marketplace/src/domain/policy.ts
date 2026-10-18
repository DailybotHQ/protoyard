import { definePolicy, type Principal } from '@protoyard/core';

export const CAPABILITIES = {
  browse: 'marketplace:browse',
  onboardSeller: 'seller:onboard',
  listingCreate: 'listings:create',
  listingRead: 'listings:read',
  listingUpdate: 'listings:update',
  listingDelete: 'listings:delete',
  orderCreate: 'orders:create',
  orderRead: 'orders:read',
} as const;

const isStaff = (principal: Principal) => principal.role === 'owner' || principal.role === 'admin';
const ownsListing = (principal: Principal, resource: unknown) =>
  isStaff(principal) ||
  (resource as { sellerPersonaId?: string } | undefined)?.sellerPersonaId === principal.persona.id;

/** Marketplace roles are simulated UX rules, never authorization security. */
export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    buyer: [
      CAPABILITIES.browse,
      CAPABILITIES.onboardSeller,
      CAPABILITIES.listingRead,
      CAPABILITIES.listingCreate,
      CAPABILITIES.listingUpdate,
      CAPABILITIES.listingDelete,
      CAPABILITIES.orderCreate,
      CAPABILITIES.orderRead,
    ],
    seller: [
      CAPABILITIES.browse,
      CAPABILITIES.onboardSeller,
      CAPABILITIES.listingRead,
      CAPABILITIES.listingCreate,
      CAPABILITIES.listingUpdate,
      CAPABILITIES.listingDelete,
      CAPABILITIES.orderCreate,
      CAPABILITIES.orderRead,
    ],
    viewer: [CAPABILITIES.browse, CAPABILITIES.listingRead],
  },
  rules: {
    [CAPABILITIES.listingUpdate]: ownsListing,
    [CAPABILITIES.listingDelete]: ownsListing,
    [CAPABILITIES.orderRead]: (principal, resource) =>
      isStaff(principal) ||
      (resource as { buyerPersonaId?: string; sellerPersonaId?: string } | undefined)
        ?.buyerPersonaId === principal.persona.id ||
      (resource as { sellerPersonaId?: string } | undefined)?.sellerPersonaId ===
        principal.persona.id,
  },
});
