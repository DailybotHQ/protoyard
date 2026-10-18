import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  read: 'plugin:read',
  manage: 'plugin:manage',
  settings: 'plugin:settings',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [CAPABILITIES.read, CAPABILITIES.manage, CAPABILITIES.settings],
    viewer: [CAPABILITIES.read],
  },
});
