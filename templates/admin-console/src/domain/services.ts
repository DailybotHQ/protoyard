import {
  createRuntimeId,
  type DomainEvent,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import type { Transaction } from 'dexie';
import { z } from 'zod';
import type {
  AdminDatabase,
  Impersonation,
  Subscription,
  Tenant,
  UserAccess,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes the change AND its audit entry (`py_events`, `source: 'user'`) in ONE transaction.
 * Impersonation is simulated: it switches the runtime's acting persona, nothing more.
 */

export { ValidationError };

export const AUDIT_TABLE = 'py_events';

export type AuditType =
  | 'tenant.created'
  | 'tenant.suspended'
  | 'tenant.reactivated'
  | 'user.disabled'
  | 'user.enabled'
  | 'subscription.cancel_scheduled'
  | 'subscription.resumed'
  | 'subscription.renewed'
  | 'impersonation.started'
  | 'impersonation.ended';

export interface AuditPayload {
  message: string;
  tenantId?: string | null;
  targetId?: string | null;
  reason?: string | null;
}

export type AuditEvent = DomainEvent<AuditPayload>;

export const AUDIT_LABELS: Record<AuditType, string> = {
  'tenant.created': 'Tenant created',
  'tenant.suspended': 'Tenant suspended',
  'tenant.reactivated': 'Tenant reactivated',
  'user.disabled': 'User disabled',
  'user.enabled': 'User enabled',
  'subscription.cancel_scheduled': 'Cancellation scheduled',
  'subscription.resumed': 'Subscription resumed',
  'subscription.renewed': 'Subscription renewed',
  'impersonation.started': 'Impersonation started',
  'impersonation.ended': 'Impersonation ended',
};

export const ReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Give a reason of at least 5 characters (it goes in the audit log)')
    .max(200, 'Keep it under 200 characters'),
});
export type ReasonInput = z.input<typeof ReasonSchema>;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have changed in another tab.`);
    this.name = 'NotFoundError';
  }
}

export function createServices(runtime: PrototypeRuntime<AdminDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const audit = (type: AuditType, payload: AuditPayload, at = now()): AuditEvent => ({
    id: createRuntimeId('audit'),
    type,
    at,
    actorId: actorId(),
    payload,
    source: 'user',
  });
  const events = () => db.table<AuditEvent, string>(AUDIT_TABLE);
  const requireTenant = async (id: string): Promise<Tenant> => {
    const tenant = await db.tenants.get(id);
    if (!tenant) throw new NotFoundError('tenant');
    return tenant;
  };
  const personaName = (id: string) => session.personas().find((p) => p.id === id)?.name ?? id;

  return {
    tenants: {
      /** Blocks the tenant (their people can't use the product). Reason goes to the audit log. */
      async suspend(id: string, input: ReasonInput): Promise<Tenant> {
        session.assert(CAPABILITIES.tenantsSuspend);
        const { reason } = parseInput(ReasonSchema, input);
        return environment.run('tenants.suspend', () =>
          db.transaction('rw', db.tenants, events(), async () => {
            const tenant = await requireTenant(id);
            if (tenant.status === 'suspended') {
              throw new ValidationError({ form: `${tenant.name} is already suspended.` });
            }
            if (tenant.status === 'churned') {
              throw new ValidationError({
                form: `${tenant.name} has churned; there is nothing to suspend.`,
              });
            }
            const at = now();
            const next: Tenant = {
              ...tenant,
              status: 'suspended',
              suspendedAt: at,
              suspendedReason: reason,
              updatedAt: at,
            };
            await db.tenants.put(next);
            await events().add(
              audit(
                'tenant.suspended',
                { message: `Suspended ${tenant.name}`, tenantId: id, reason },
                at
              )
            );
            return next;
          })
        );
      },

      async reactivate(id: string): Promise<Tenant> {
        session.assert(CAPABILITIES.tenantsSuspend);
        return environment.run('tenants.reactivate', () =>
          db.transaction('rw', db.tenants, events(), async () => {
            const tenant = await requireTenant(id);
            if (tenant.status !== 'suspended') {
              throw new ValidationError({ form: `${tenant.name} is not suspended.` });
            }
            const at = now();
            const next: Tenant = {
              ...tenant,
              status: 'active',
              suspendedAt: null,
              suspendedReason: null,
              updatedAt: at,
            };
            await db.tenants.put(next);
            await events().add(
              audit(
                'tenant.reactivated',
                { message: `Reactivated ${tenant.name}`, tenantId: id },
                at
              )
            );
            return next;
          })
        );
      },
    },

    users: {
      /** Disables or re-enables a tenant person's sign-in (simulated). */
      async setDisabled(personaId: string, disabled: boolean): Promise<UserAccess> {
        session.assert(CAPABILITIES.usersDisable);
        return environment.run(disabled ? 'users.disable' : 'users.enable', () =>
          db.transaction('rw', db.user_access, events(), async () => {
            const access = await db.user_access.get(personaId);
            if (!access) throw new NotFoundError('user');
            if (access.disabled === disabled) return access;
            const at = now();
            const next: UserAccess = { ...access, disabled, updatedAt: at };
            await db.user_access.put(next);
            const name = personaName(personaId);
            await events().add(
              audit(
                disabled ? 'user.disabled' : 'user.enabled',
                {
                  message: `${disabled ? 'Disabled' : 'Enabled'} ${name}`,
                  tenantId: access.tenantId,
                  targetId: personaId,
                },
                at
              )
            );
            return next;
          })
        );
      },
    },

    subscriptions: {
      /** Schedules cancellation at the end of the period (billing:manage). */
      async cancel(id: string): Promise<Subscription> {
        return setCancel(id, true);
      },
      async resume(id: string): Promise<Subscription> {
        return setCancel(id, false);
      },
    },

    impersonation: {
      /** The active impersonation, if any (survives reloads). */
      current: () => db.impersonation.get('active'),

      /**
       * Acts as a tenant person (simulated: switches the runtime persona).
       * The reason and the start go to the audit log; a banner stays up until stop().
       */
      async start(personaId: string, input: ReasonInput): Promise<Impersonation> {
        session.assert(CAPABILITIES.usersImpersonate);
        const { reason } = parseInput(ReasonSchema, input);
        const staff = session.principal();
        if (!staff) throw new Error('No active persona. Load a scenario first.');
        const record = await environment.run('impersonation.start', () =>
          db.transaction('rw', db.impersonation, db.user_access, db.tenants, events(), async () => {
            if (await db.impersonation.get('active')) {
              throw new ValidationError({ form: 'Stop the current impersonation first.' });
            }
            const access = await db.user_access.get(personaId);
            if (!access)
              throw new ValidationError({ form: 'Only tenant people can be impersonated.' });
            if (access.disabled) {
              throw new ValidationError({
                form: 'This user is disabled. Enable them before impersonating.',
              });
            }
            const at = now();
            const row: Impersonation = {
              id: 'active',
              staffId: staff.persona.id,
              staffOrganizationId: staff.organization?.id ?? null,
              targetId: personaId,
              tenantId: access.tenantId,
              reason,
              startedAt: at,
            };
            await db.impersonation.put(row);
            await events().add(
              audit(
                'impersonation.started',
                {
                  message: `Started impersonating ${personaName(personaId)}`,
                  tenantId: access.tenantId,
                  targetId: personaId,
                  reason,
                },
                at
              )
            );
            return row;
          })
        );
        await session.switchActor(personaId);
        await session.switchOrganization(record.tenantId);
        return record;
      },

      /**
       * Ends the impersonation and returns to the staff persona. Deliberately
       * NOT routed through the simulated network: the way back must work even
       * when DevTools has the app offline. Needs no capability for the same reason.
       */
      async stop(): Promise<void> {
        const row = await db.impersonation.get('active');
        if (!row) return;
        const at = now();
        await db.transaction('rw', db.impersonation, events(), async (tx: Transaction) => {
          await tx.table('impersonation').delete('active');
          await events().add({
            id: createRuntimeId('audit'),
            type: 'impersonation.ended',
            at,
            actorId: row.staffId,
            payload: {
              message: `Stopped impersonating ${personaName(row.targetId)}`,
              tenantId: row.tenantId,
              targetId: row.targetId,
            },
            source: 'user',
          } satisfies AuditEvent);
        });
        await session.switchActor(row.staffId);
        if (row.staffOrganizationId) await session.switchOrganization(row.staffOrganizationId);
      },
    },
  };

  async function setCancel(id: string, cancelAtPeriodEnd: boolean): Promise<Subscription> {
    session.assert(CAPABILITIES.billingManage);
    return environment.run(
      cancelAtPeriodEnd ? 'subscriptions.cancel' : 'subscriptions.resume',
      () =>
        db.transaction('rw', db.subscriptions, db.tenants, events(), async () => {
          const subscription = await db.subscriptions.get(id);
          if (!subscription) throw new NotFoundError('subscription');
          if (subscription.status === 'canceled') {
            throw new ValidationError({ form: 'This subscription has already ended.' });
          }
          if (subscription.cancelAtPeriodEnd === cancelAtPeriodEnd) return subscription;
          const tenant = await requireTenant(subscription.tenantId);
          const at = now();
          const next: Subscription = { ...subscription, cancelAtPeriodEnd, updatedAt: at };
          await db.subscriptions.put(next);
          await events().add(
            audit(
              cancelAtPeriodEnd ? 'subscription.cancel_scheduled' : 'subscription.resumed',
              {
                message: cancelAtPeriodEnd
                  ? `Scheduled cancellation of ${tenant.name}'s ${subscription.plan} plan`
                  : `Resumed ${tenant.name}'s ${subscription.plan} plan`,
                tenantId: tenant.id,
              },
              at
            )
          );
          return next;
        })
    );
  }
}

export type AdminServices = ReturnType<typeof createServices>;
