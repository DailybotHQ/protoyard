import { definePolicy } from '@protoyard/core';

export const PROJECT_CAPABILITIES = {
  read: 'projects:read',
  create: 'projects:create',
  update: 'projects:update',
  delete: 'projects:delete',
} as const;

/** Roles are simulated UX controls; service assertions remain authoritative. */
export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      PROJECT_CAPABILITIES.read,
      PROJECT_CAPABILITIES.create,
      PROJECT_CAPABILITIES.update,
      'onboarding:progress',
      'members:invite',
      'workspaces:rename',
    ],
    viewer: [PROJECT_CAPABILITIES.read, 'onboarding:progress'],
  },
});
