import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  read: 'assistant:read',
  write: 'assistant:write',
  settings: 'assistant:settings',
  data: 'assistant:data',
} as const;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    member: [CAPABILITIES.read, CAPABILITIES.write, CAPABILITIES.settings],
    viewer: [CAPABILITIES.read],
  },
});
