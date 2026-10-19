import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:  everything, including opening hours.
 *  - staff:  books, moves and cancels any booking.
 *  - viewer: read-only.
 *  - client: uses the public booking page only (books a free slot).
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  bookingsManage: 'bookings:manage',
  bookingsBookPublic: 'bookings:book-public',
  availabilityManage: 'availability:manage',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  staff: 'Staff',
  viewer: 'Viewer',
  client: 'Client',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    staff: [CAPABILITIES.bookingsManage, CAPABILITIES.bookingsBookPublic],
    viewer: [],
    client: [CAPABILITIES.bookingsBookPublic],
  },
});
