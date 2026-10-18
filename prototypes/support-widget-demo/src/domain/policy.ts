import { definePolicy } from '@protoyard/core';

/** Simulated capabilities — not a security boundary. */
export const CAPABILITIES = {
  read: 'chat:read',
  send: 'messages:send',
  handoff: 'support:handoff',
  lookupOrder: 'orders:lookup',
  requestReturn: 'returns:create',
  readReturns: 'returns:read',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  visitor: 'Customer',
  agent: 'Support agent',
};

export const policy = definePolicy({
  roles: {
    visitor: [
      CAPABILITIES.read,
      CAPABILITIES.send,
      CAPABILITIES.handoff,
      CAPABILITIES.lookupOrder,
      CAPABILITIES.requestReturn,
      CAPABILITIES.readReturns,
    ],
    agent: ['*'],
  },
  rules: {},
});
