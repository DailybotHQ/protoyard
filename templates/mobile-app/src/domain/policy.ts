import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). */
export const CAPABILITIES = {
  read: 'items:read',
  create: 'items:create',
  update: 'items:update',
  delete: 'items:delete',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  viewer: 'Viewer (read-only)',
};

/** Simulated permissions — UX, not security. Services still enforce them. */
export const policy = definePolicy({
  roles: {
    owner: ['*'],
    viewer: [CAPABILITIES.read],
  },
});
