import { definePolicy, type Principal } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner / admin: shop, see every order, edit price & stock, update order status.
 *  - member:        a signed-in customer: cart, checkout, own orders.
 *  - viewer:        a guest: browse the catalog only.
 *
 * Services call `session.assert(capability, resource)`, so a forbidden action
 * fails even when the UI is bypassed (e.g. from the browser console).
 */
export const CAPABILITIES = {
  browse: 'catalog:browse',
  cart: 'cart:manage',
  checkout: 'orders:create',
  ordersReadOwn: 'orders:read',
  ordersCancel: 'orders:cancel',
  ordersManage: 'orders:manage',
  productsManage: 'products:manage',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Store owner',
  admin: 'Store admin',
  member: 'Customer',
  viewer: 'Guest',
};

const isStaff = (principal: Principal) => principal.role === 'owner' || principal.role === 'admin';

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      CAPABILITIES.browse,
      CAPABILITIES.cart,
      CAPABILITIES.checkout,
      CAPABILITIES.ordersReadOwn,
      CAPABILITIES.ordersCancel,
    ],
    viewer: [CAPABILITIES.browse],
  },
  rules: {
    // Customers see and cancel only their own orders; staff see everything.
    [CAPABILITIES.ordersReadOwn]: (principal, order) =>
      isStaff(principal) ||
      order === undefined ||
      (order as { customerId?: string }).customerId === principal.persona.id,
    [CAPABILITIES.ordersCancel]: (principal, order) =>
      isStaff(principal) ||
      order === undefined ||
      (order as { customerId?: string }).customerId === principal.persona.id,
  },
});
