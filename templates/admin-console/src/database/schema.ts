import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one) and bump `storage.schemaVersion` in protoyard.json.
 *
 * Identity model: every tenant is an organization in `py_organizations`
 * (type `tenant`) and its people are personas with memberships, so staff can
 * impersonate them through the runtime session. Staff belong to the
 * scenario organization (type `internal`). `tenants` and `subscriptions`
 * hold what the console manages on top of identities; the audit log is the
 * reserved `py_events` table (`source: 'user'` for staff actions).
 *
 * Rows are type aliases (not interfaces) so they stay assignable to `Row`.
 */

export const TENANT_STATUSES = ['active', 'trialing', 'suspended', 'churned'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const PLANS = ['starter', 'growth', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const REGIONS = ['us-east', 'eu-west', 'ap-south'] as const;
export type Region = (typeof REGIONS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Console data for a tenant; `id` equals the tenant's organization id. */
export type Tenant = {
  id: string;
  /** Same as `id`: lets integrity rules check the organization exists. */
  organizationId: string;
  name: string;
  domain: string;
  plan: Plan;
  status: TenantStatus;
  region: Region;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  updatedAt: string;
};

/** People state the console controls on top of the persona (disable sign-in). */
export type UserAccess = {
  /** The persona id. */
  id: string;
  personaId: string;
  tenantId: string;
  disabled: boolean;
  lastSeenAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  tenantId: string;
  plan: Plan;
  status: SubscriptionStatus;
  /** Integer cents per month (AGENTS rule 7). */
  mrrCents: number;
  seats: number;
  renewsAt: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
};

/** The active impersonation (one row, `id: 'active'`), so a reload keeps the banner. */
export type Impersonation = {
  id: 'active';
  staffId: string;
  staffOrganizationId: string | null;
  targetId: string;
  tenantId: string;
  reason: string;
  startedAt: string;
};

export type AdminDatabase = Dexie & {
  tenants: EntityTable<Tenant, 'id'>;
  user_access: EntityTable<UserAccess, 'id'>;
  subscriptions: EntityTable<Subscription, 'id'>;
  impersonation: EntityTable<Impersonation, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        tenants: 'id, name, status, plan, region, createdAt',
        user_access: 'id, tenantId, disabled',
        subscriptions: 'id, tenantId, status, plan',
        impersonation: 'id',
      },
    },
  ],
};
