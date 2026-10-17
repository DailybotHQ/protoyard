import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  read: 'favorites:read',
  manage: 'favorites:manage',
} as const;

/** Designers curate favorites; viewers browse read-only (to demo permission states). */
export const policy = definePolicy({
  roles: {
    designer: ['*'],
    viewer: [CAPABILITIES.read],
  },
});
