import { definePolicy } from '@protoyard/core';
import type { Deal } from '../database/schema.ts';

/**
 * Simulated permissions (UX only — not real security).
 *
 *  - owner:  everything, including billing.
 *  - admin:  everything except billing; manages the team and settings.
 *  - rep:    works the pipeline; may edit/delete only deals they own.
 *  - viewer: read-only.
 *
 * Services call `session.assert(capability, resource)` so a forbidden action
 * fails even when the UI is bypassed (e.g. from the browser console).
 */
export const CAPABILITIES = {
  companiesRead: 'companies:read',
  companiesWrite: 'companies:write',
  companiesDelete: 'companies:delete',
  contactsWrite: 'contacts:write',
  contactsDelete: 'contacts:delete',
  dealsCreate: 'deals:create',
  dealsUpdate: 'deals:update',
  dealsDelete: 'deals:delete',
  activitiesCreate: 'activities:create',
  teamManage: 'team:manage',
  settingsManage: 'settings:manage',
  billingManage: 'billing:manage',
} as const;

const READ = [CAPABILITIES.companiesRead];
const PIPELINE = [
  ...READ,
  CAPABILITIES.companiesWrite,
  CAPABILITIES.contactsWrite,
  CAPABILITIES.dealsCreate,
  CAPABILITIES.dealsUpdate,
  CAPABILITIES.dealsDelete,
  CAPABILITIES.activitiesCreate,
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  rep: 'Sales rep',
  viewer: 'Viewer',
};

const ownsDeal = (personaId: string, resource: unknown) =>
  resource === undefined || (resource as Pick<Deal, 'ownerId'>).ownerId === personaId;

export const policy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*', `-${CAPABILITIES.billingManage}`],
    rep: PIPELINE,
    viewer: READ,
  },
  rules: {
    // Admins and owners pass through `*`; reps are limited to their own deals.
    [CAPABILITIES.dealsUpdate]: (principal, deal) =>
      principal.role !== 'rep' || ownsDeal(principal.persona.id, deal),
    [CAPABILITIES.dealsDelete]: (principal, deal) =>
      principal.role !== 'rep' || ownsDeal(principal.persona.id, deal),
  },
});
