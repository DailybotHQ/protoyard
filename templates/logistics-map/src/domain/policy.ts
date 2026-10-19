import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = { read: 'dispatch:read', manage: 'dispatch:manage' } as const;
export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    dispatcher: [CAPABILITIES.read, CAPABILITIES.manage],
    driver: [CAPABILITIES.read],
    viewer: [CAPABILITIES.read],
  },
});
