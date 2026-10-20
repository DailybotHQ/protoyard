import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  read: 'monitoring:read',
  acknowledge: 'alerts:acknowledge',
  resolve: 'alerts:resolve',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    operator: [CAPABILITIES.read, CAPABILITIES.acknowledge, CAPABILITIES.resolve],
    technician: [CAPABILITIES.read, CAPABILITIES.acknowledge],
    viewer: [CAPABILITIES.read],
  },
});
