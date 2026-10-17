import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). */
export const CAPABILITIES = {
  read: 'notes:read',
  create: 'notes:create',
  update: 'notes:update',
  delete: 'notes:delete',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    viewer: [CAPABILITIES.read],
  },
});
