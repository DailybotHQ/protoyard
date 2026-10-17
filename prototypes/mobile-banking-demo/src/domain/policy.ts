import { definePolicy } from '@protoyard/core';

/**
 * Household banking roles (simulated; NOT real access control).
 *  - owner:     primary account holder — everything.
 *  - member:    joint holder — can move money up to $500 per transfer.
 *  - viewer:    dependent with view-only access.
 */
export const CAPABILITIES = {
  accountsRead: 'accounts:read',
  transfersCreate: 'transfers:create',
  beneficiariesManage: 'beneficiaries:manage',
  accountsManage: 'accounts:manage',
} as const;

export const MEMBER_TRANSFER_LIMIT_CENTS = 50_000;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Primary holder',
  member: 'Joint holder',
  viewer: 'View only',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    member: [CAPABILITIES.accountsRead, CAPABILITIES.transfersCreate],
    viewer: [CAPABILITIES.accountsRead],
  },
  rules: {
    [CAPABILITIES.transfersCreate]: (principal, resource) => {
      if (principal.role !== 'member' || resource === undefined) return true;
      return (resource as { amountCents: number }).amountCents <= MEMBER_TRANSFER_LIMIT_CENTS;
    },
  },
});
