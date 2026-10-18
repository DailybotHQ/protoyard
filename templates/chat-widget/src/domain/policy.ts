import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). Simulated, not security. */
export const CAPABILITIES = {
  read: 'chat:read',
  send: 'messages:send',
  handoff: 'support:handoff',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  agent: 'Support agent',
};

export const policy = definePolicy({
  roles: {
    visitor: [CAPABILITIES.read, CAPABILITIES.send, CAPABILITIES.handoff],
    agent: ['*'],
  },
  rules: {},
});
