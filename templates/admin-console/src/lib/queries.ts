import type { Membership, Persona } from '@protoyard/core';
import type { AdminDatabase, Subscription, Tenant, UserAccess } from '../database/schema.ts';
import { AUDIT_TABLE, type AuditEvent } from '../domain/services.ts';

/**
 * Read models for screens (Dexie queries, so `liveQuery` re-runs when any of
 * the tables it read change). Identities live in the reserved `py_*` tables.
 */

export interface TenantPerson {
  persona: Persona;
  membership: Membership;
  access: UserAccess;
  tenant: Tenant | undefined;
}

export async function tenantPeople(db: AdminDatabase, tenantId?: string): Promise<TenantPerson[]> {
  const [personas, memberships, access, tenants] = await Promise.all([
    db.table<Persona, string>('py_personas').toArray(),
    db.table<Membership, string>('py_memberships').toArray(),
    tenantId
      ? db.user_access.where('tenantId').equals(tenantId).toArray()
      : db.user_access.toArray(),
    db.tenants.toArray(),
  ]);
  const byPersona = new Map(personas.map((p) => [p.id, p]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  return access.flatMap((row) => {
    const persona = byPersona.get(row.personaId);
    const membership = memberships.find(
      (m) => m.personaId === row.personaId && m.organizationId === row.tenantId
    );
    return persona && membership
      ? [{ persona, membership, access: row, tenant: tenantById.get(row.tenantId) }]
      : [];
  });
}

export interface TenantRow extends Tenant {
  people: number;
  mrrCents: number;
  subscription: Subscription | undefined;
}

export async function tenantRows(db: AdminDatabase): Promise<TenantRow[]> {
  const [tenants, subscriptions, access] = await Promise.all([
    db.tenants.toArray(),
    db.subscriptions.toArray(),
    db.user_access.toArray(),
  ]);
  return tenants.map((tenant) => {
    const subscription = subscriptions.find((s) => s.tenantId === tenant.id);
    return {
      ...tenant,
      people: access.filter((a) => a.tenantId === tenant.id).length,
      mrrCents: subscription?.mrrCents ?? 0,
      subscription,
    };
  });
}

/** Newest first. */
export async function auditLog(db: AdminDatabase, limit?: number): Promise<AuditEvent[]> {
  const rows = (
    await db.table<AuditEvent, string>(AUDIT_TABLE).orderBy('at').reverse().toArray()
  ).filter(
    (event) =>
      typeof event.payload === 'object' && event.payload !== null && 'message' in event.payload
  );
  return limit ? rows.slice(0, limit) : rows;
}
