import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). */
export const CAPABILITIES = {
  read: 'boards:read',
  create: 'boards:create',
  update: 'boards:update',
  delete: 'boards:delete',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    viewer: [CAPABILITIES.read],
  },
});
