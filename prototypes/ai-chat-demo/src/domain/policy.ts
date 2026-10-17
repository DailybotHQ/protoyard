import { definePolicy } from '@protoyard/core';
import type { Conversation } from '../database/schema.ts';

/** Simulated workspace roles (UX only, not real security). */
export const CAPABILITIES = {
  read: 'chat:read',
  send: 'messages:send',
  createConversation: 'conversations:create',
  manageConversation: 'conversations:manage',
  invokeAgents: 'agents:invoke',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Guest (read-only)',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      CAPABILITIES.read,
      CAPABILITIES.send,
      CAPABILITIES.createConversation,
      CAPABILITIES.manageConversation,
      CAPABILITIES.invokeAgents,
    ],
    viewer: [CAPABILITIES.read],
  },
  rules: {
    // Members may rename/archive/delete only conversations they created.
    [CAPABILITIES.manageConversation]: (principal, conversation) =>
      principal.role !== 'member' ||
      conversation === undefined ||
      (conversation as Conversation).createdBy === principal.persona.id,
  },
});
