import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:  everything, including billing.
 *  - admin:  everything except billing.
 *  - member: works with customers and orders, but cannot delete customers or change settings.
 *  - viewer: read-only.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  customersCreate: 'customers:create',
  customersUpdate: 'customers:update',
  customersDelete: 'customers:delete',
  ordersCreate: 'orders:create',
  ordersUpdate: 'orders:update',
  settingsManage: 'settings:manage',
  billingManage: 'billing:manage',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*', `-${CAPABILITIES.billingManage}`],
    member: [
      CAPABILITIES.customersCreate,
      CAPABILITIES.customersUpdate,
      CAPABILITIES.ordersCreate,
      CAPABILITIES.ordersUpdate,
    ],
    viewer: [],
  },
});
