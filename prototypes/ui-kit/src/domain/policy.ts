import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  read: 'favorites:read',
  manage: 'favorites:manage',
  /** Save or replace custom themes in the Theme Lab. */
  themeManage: 'theme:manage',
  /** Apply a theme override for this browser (built-in, library or custom). */
  themeApply: 'theme:apply',
} as const;

/** Designers curate favorites and themes; viewers browse and can apply a theme. */
export const policy = definePolicy({
  roles: {
    designer: ['*'],
    viewer: [CAPABILITIES.read, CAPABILITIES.themeApply],
  },
});
