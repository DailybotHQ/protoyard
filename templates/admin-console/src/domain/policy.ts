import { definePolicy } from '@protoyard/core';

/**
 * Simulated staff permissions (UX only — not real security).
 *
 *  - owner (platform owner):  everything, including billing changes.
 *  - admin (support lead):    suspend/reactivate tenants, disable users, impersonate; no billing.
 *  - member (support agent):  read everything and impersonate users to reproduce issues.
 *  - viewer (auditor):        read-only, including the audit log.
 *
 * Tenant people (roles `tenant_owner`, `tenant_admin`, `tenant_member`) get no
 * console capability: while staff impersonate one, the console shows only that
 * person's view and the way back. Services call `session.assert` so a forbidden
 * action fails even when the UI is bypassed.
 */
export const CAPABILITIES = {
  read: 'console:read',
  tenantsSuspend: 'tenants:suspend',
  usersDisable: 'users:disable',
  usersImpersonate: 'users:impersonate',
  billingManage: 'billing:manage',
} as const;

export const STAFF_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export const TENANT_ROLES = ['tenant_owner', 'tenant_admin', 'tenant_member'] as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Platform owner',
  admin: 'Support lead',
  member: 'Support agent',
  viewer: 'Auditor',
  tenant_owner: 'Owner',
  tenant_admin: 'Admin',
  tenant_member: 'Member',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*', `-${CAPABILITIES.billingManage}`],
    member: [CAPABILITIES.read, CAPABILITIES.usersImpersonate],
    viewer: [CAPABILITIES.read],
    tenant_owner: [],
    tenant_admin: [],
    tenant_member: [],
  },
});
