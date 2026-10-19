import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  accountsRead: 'accounts:read',
  transactionsRead: 'transactions:read',
  budgetsRead: 'budgets:read',
  transfersCreate: 'transfers:create',
} as const;

export const policy = definePolicy({
  roles: {
    owner: Object.values(CAPABILITIES),
    member: [
      CAPABILITIES.accountsRead,
      CAPABILITIES.transactionsRead,
      CAPABILITIES.budgetsRead,
      CAPABILITIES.transfersCreate,
    ],
    viewer: [CAPABILITIES.accountsRead, CAPABILITIES.transactionsRead, CAPABILITIES.budgetsRead],
  },
});
