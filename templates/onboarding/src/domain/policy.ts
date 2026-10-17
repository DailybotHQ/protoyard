import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - Everyone can complete their own onboarding (profile, preferences).
 *  - owner/admin can configure the workspace.
 *  - owner/admin/member can invite teammates.
 *  - viewer sees the workspace step read-only and cannot invite.
 *
 * Services call `session.assert(capability)` so the rules hold even when the
 * UI is bypassed. Screens use `can(capability)` to adapt.
 */
export const CAPABILITIES = {
  progress: 'onboarding:progress',
  workspaceUpdate: 'workspace:update',
  invitesCreate: 'invites:create',
} as const;

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
    member: [CAPABILITIES.progress, CAPABILITIES.invitesCreate],
    viewer: [CAPABILITIES.progress],
  },
});
