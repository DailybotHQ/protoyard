import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:  everything, including creating spaces.
 *  - editor: creates, edits, moves, restores and deletes pages.
 *  - viewer: reads and searches.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  pagesEdit: 'pages:edit',
  spacesManage: 'spaces:manage',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    editor: [CAPABILITIES.pagesEdit],
    viewer: [],
  },
});
