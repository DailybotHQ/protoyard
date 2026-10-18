import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:  everything.
 *  - editor: writes documents and tags, but cannot delete folders.
 *  - viewer: read-only.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Menus, buttons and shortcuts use `can(capability)`.
 */
export const CAPABILITIES = {
  documentsCreate: 'documents:create',
  documentsUpdate: 'documents:update',
  documentsDelete: 'documents:delete',
  foldersCreate: 'folders:create',
  foldersDelete: 'folders:delete',
  tagsCreate: 'tags:create',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    editor: ['*', `-${CAPABILITIES.foldersDelete}`],
    viewer: [],
  },
});
