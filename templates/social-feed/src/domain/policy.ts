import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - member:    posts, reacts, comments, follows; deletes their own posts.
 *  - moderator: everything a member does, and removes anyone's post.
 *  - viewer:    reads the feed and profiles; cannot post or interact.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  postsCreate: 'posts:create',
  postsModerate: 'posts:moderate',
  interact: 'social:interact',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  member: 'Member',
  moderator: 'Moderator',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    moderator: ['*'],
    member: [CAPABILITIES.postsCreate, CAPABILITIES.interact],
    viewer: [],
  },
});
