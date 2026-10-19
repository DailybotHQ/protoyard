import { definePolicy, type Principal } from '@protoyard/core';

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

/**
 * Record-level rule for orders: a visitor sees only orders on their own
 * persona email; a support agent sees every order. Without a record (a
 * role-wide check such as `can('orders:lookup')` in the UI) it passes.
 */
export function ownsOrder(principal: Principal, resource: unknown): boolean {
  if (resource === undefined || principal.role === 'agent') return true;
  const email = (resource as { email?: unknown } | null)?.email;
  const mine = principal.persona.email?.trim().toLowerCase();
  return typeof email === 'string' && !!mine && email.trim().toLowerCase() === mine;
}

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
  rules: {
    [CAPABILITIES.lookupOrder]: ownsOrder,
    [CAPABILITIES.requestReturn]: ownsOrder,
  },
});
