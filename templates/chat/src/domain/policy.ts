import { definePolicy } from '@protoyard/core';
import type { Conversation } from '../database/schema.ts';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). Simulated, not security. */
export const CAPABILITIES = {
  read: 'chat:read',
  send: 'messages:send',
  create: 'conversations:create',
  manage: 'conversations:manage',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  member: 'Member',
  viewer: 'Viewer (read-only)',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    member: [CAPABILITIES.read, CAPABILITIES.send, CAPABILITIES.create, CAPABILITIES.manage],
    viewer: [CAPABILITIES.read],
  },
  rules: {
    // Members rename/delete only the conversations they started.
    [CAPABILITIES.manage]: (principal, conversation) =>
      principal.role !== 'member' ||
      conversation === undefined ||
      (conversation as Conversation).createdBy === principal.persona.id,
  },
});
