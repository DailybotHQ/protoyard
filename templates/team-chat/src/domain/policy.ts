import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). Simulated, not security. */
export const CAPABILITIES = {
  'workspace:read': 'workspace:read',
  'channel:read': 'channel:read',
  'channel:create': 'channel:create',
  'channel:manage': 'channel:manage',
  'message:read': 'message:read',
  'message:create': 'message:create',
  'message:react': 'message:react',
  'file:share': 'file:share',
  'huddle:start': 'huddle:start',
  'search:run': 'search:run',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      CAPABILITIES['workspace:read'],
      CAPABILITIES['channel:read'],
      CAPABILITIES['channel:create'],
      CAPABILITIES['message:read'],
      CAPABILITIES['message:create'],
      CAPABILITIES['message:react'],
      CAPABILITIES['file:share'],
      CAPABILITIES['huddle:start'],
      CAPABILITIES['search:run'],
    ],
    viewer: [
      CAPABILITIES['workspace:read'],
      CAPABILITIES['channel:read'],
      CAPABILITIES['message:read'],
      CAPABILITIES['search:run'],
    ],
  },
});
