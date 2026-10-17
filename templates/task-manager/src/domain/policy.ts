import { definePolicy, type Principal } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner / admin: manage projects and every task and comment.
 *  - member:        create and edit any task; delete only tasks they reported
 *                   and comments they wrote.
 *  - viewer:        read-only.
 *
 * Services call `session.assert(capability, resource)`, so a forbidden action
 * fails even when the UI is bypassed (e.g. from the browser console).
 */
export const CAPABILITIES = {
  read: 'workspace:read',
  projectsManage: 'projects:manage',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksDelete: 'tasks:delete',
  commentsCreate: 'comments:create',
  commentsDelete: 'comments:delete',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const isManager = (principal: Principal) =>
  principal.role === 'owner' || principal.role === 'admin';

/** Without a resource (generic UI checks) the rule passes; services always pass one. */
const ownedBy = (field: string) => (principal: Principal, resource: unknown) =>
  isManager(principal) ||
  resource === undefined ||
  (resource as Record<string, unknown>)[field] === principal.persona.id;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: [
      CAPABILITIES.read,
      CAPABILITIES.tasksCreate,
      CAPABILITIES.tasksUpdate,
      CAPABILITIES.tasksDelete,
      CAPABILITIES.commentsCreate,
      CAPABILITIES.commentsDelete,
    ],
    viewer: [CAPABILITIES.read],
  },
  rules: {
    [CAPABILITIES.tasksDelete]: ownedBy('reporterId'),
    [CAPABILITIES.commentsDelete]: ownedBy('authorId'),
  },
});
