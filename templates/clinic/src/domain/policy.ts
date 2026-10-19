import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security, and not an access
 * control model for real health data).
 *
 *  - admin:      everything except writing notes (only the treating clinician writes and signs).
 *  - front-desk: registers and edits patients, books, checks in and cancels appointments,
 *                reveals sensitive fields; cannot read visit notes.
 *  - clinician:  reads and writes visit notes for their own appointments, reveals sensitive fields.
 *  - viewer:     read-only, sensitive fields stay masked, no visit notes.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  patientsManage: 'patients:manage',
  patientsReveal: 'patients:reveal',
  appointmentsManage: 'appointments:manage',
  notesRead: 'notes:read',
  notesWrite: 'notes:write',
  auditRead: 'audit:read',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  'front-desk': 'Front desk',
  clinician: 'Clinician',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    admin: [
      CAPABILITIES.patientsManage,
      CAPABILITIES.patientsReveal,
      CAPABILITIES.appointmentsManage,
      CAPABILITIES.notesRead,
      CAPABILITIES.auditRead,
    ],
    'front-desk': [
      CAPABILITIES.patientsManage,
      CAPABILITIES.patientsReveal,
      CAPABILITIES.appointmentsManage,
    ],
    clinician: [CAPABILITIES.patientsReveal, CAPABILITIES.notesRead, CAPABILITIES.notesWrite],
    viewer: [CAPABILITIES.auditRead],
  },
});
