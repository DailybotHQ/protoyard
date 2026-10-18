import { definePolicy } from '@protoyard/core';

/** Capabilities are plain strings; roles grant lists of them (`*` = all). Simulated, not security. */
export const CAPABILITIES = {
  agentsRead: 'agents:read',
  agentsCreate: 'agents:create',
  agentsUpdate: 'agents:update',
  agentsDelete: 'agents:delete',
  runsRead: 'runs:read',
  runsCreate: 'runs:create',
  datasetsRead: 'datasets:read',
  datasetsWrite: 'datasets:write',
  evaluationsRead: 'evaluations:read',
  evaluationsRun: 'evaluations:run',
} as const;

const READ = [
  CAPABILITIES.agentsRead,
  CAPABILITIES.runsRead,
  CAPABILITIES.datasetsRead,
  CAPABILITIES.evaluationsRead,
];

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      ...READ,
      CAPABILITIES.agentsCreate,
      CAPABILITIES.agentsUpdate,
      CAPABILITIES.runsCreate,
      CAPABILITIES.datasetsWrite,
      CAPABILITIES.evaluationsRun,
    ],
    viewer: READ,
  },
});

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Builder',
  viewer: 'Viewer',
};
