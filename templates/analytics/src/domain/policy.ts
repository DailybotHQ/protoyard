import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner, admin: edit dashboards and manage every segment.
 *  - member:       edit dashboards, create segments, rename and delete their own.
 *  - viewer:       read-only.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  dashboardsEdit: 'dashboards:edit',
  segmentsCreate: 'segments:create',
  segmentsManageOwn: 'segments:manage-own',
  segmentsManageAll: 'segments:manage-all',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      CAPABILITIES.dashboardsEdit,
      CAPABILITIES.segmentsCreate,
      CAPABILITIES.segmentsManageOwn,
    ],
    viewer: [],
  },
});
