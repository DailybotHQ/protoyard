import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = { read: 'kit:read', review: 'kit:review' } as const;

export const policy = definePolicy({
  roles: {
    designer: ['*'],
    reviewer: [CAPABILITIES.read, CAPABILITIES.review],
    viewer: [CAPABILITIES.read],
  },
});
