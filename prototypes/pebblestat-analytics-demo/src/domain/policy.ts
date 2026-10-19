import { definePolicy } from '@protoyard/core';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:   everything, including other people's reports, segments and alerts.
 *  - analyst: edits dashboards; saves reports and segments, creates alerts and
 *             annotations; renames and deletes only their own.
 *  - viewer:  read-only.
 *
 * Services call `session.assert(capability)` so a forbidden action fails even
 * when the UI is bypassed. Screens use `can(capability)` to hide controls.
 */
export const CAPABILITIES = {
  dashboardsEdit: 'dashboards:edit',
  segmentsCreate: 'segments:create',
  segmentsManageOwn: 'segments:manage-own',
  segmentsManageAll: 'segments:manage-all',
  reportsSave: 'reports:save',
  reportsManageAll: 'reports:manage-all',
  alertsManage: 'alerts:manage',
  alertsManageAll: 'alerts:manage-all',
  annotationsCreate: 'annotations:create',
  annotationsManageAll: 'annotations:manage-all',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    analyst: [
      CAPABILITIES.dashboardsEdit,
      CAPABILITIES.segmentsCreate,
      CAPABILITIES.segmentsManageOwn,
      CAPABILITIES.reportsSave,
      CAPABILITIES.alertsManage,
      CAPABILITIES.annotationsCreate,
    ],
    viewer: [],
  },
});
