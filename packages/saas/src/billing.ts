import {
  createRuntimeId,
  type DomainEvent,
  type EventApplyContext,
  eventId,
  isExampleEmail,
  type Organization,
  OrganizationSchema,
  type PrototypeRuntime,
  parseInput,
  type TimelineContext,
} from '@protoyard/core';
import { z } from 'zod';
import {
  type SaasInboxMessage,
  SaasInboxMessageSchema,
  type SaasInvoice,
  SaasInvoiceSchema,
  type SaasSubscription,
  SaasSubscriptionSchema,
} from './schema.ts';

/** Every billing operation is a UX simulation; no payment provider is contacted. */
export const BILLING_CAPABILITY = 'billing:manage';
export const BILLING_TRIAL_EXPIRED_EVENT = 'saas.billing.trial-expired';
const BILLING_TABLES = [
  'py_organizations',
  'py_memberships',
  'py_personas',
  'saas_subscriptions',
  'saas_invoices',
  'saas_inbox',
];

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const BillingPlanSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().trim().min(1).max(100),
    /** Per-seat price in integer cents. */
    unitAmountCents: cents,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    interval: z.enum(['month', 'year']),
    trialDays: z.number().int().min(1).max(90).default(14),
  })
  .strict();
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const CheckoutInputSchema = z
  .object({
    planId: z.string().trim().min(1),
    /** Selected simulator result; deliberately contains no card or bank fields. */
    outcome: z.enum(['success', 'declined', 'requires-action']).default('success'),
  })
  .strict();
export type CheckoutInput = z.input<typeof CheckoutInputSchema>;
export type CheckoutOutcome = z.infer<typeof CheckoutInputSchema>['outcome'];

export const StartTrialInputSchema = z
  .object({
    planId: z.string().trim().min(1),
    trialDays: z.number().int().min(1).max(90).optional(),
    seats: z.number().int().min(1).max(100_000).optional(),
  })
  .strict();

export interface BillingDatabaseTable<T> {
  get(id: string): Promise<T | undefined>;
  add(row: T): Promise<unknown>;
  put(row: T): Promise<unknown>;
  update(id: string, changes: Partial<T>): Promise<number>;
  toArray(): Promise<T[]>;
  where(index: string): { equals(value: string): { toArray(): Promise<T[]> } };
}

export interface BillingDatabase {
  table<T>(name: string): BillingDatabaseTable<T>;
  rows<T>(name: string): BillingDatabaseTable<T>;
  transaction<T>(mode: 'rw', tables: string[], scope: () => Promise<T>): Promise<T>;
}

export interface BillingAttempt {
  outcome: CheckoutOutcome;
  invoice: SaasInvoice;
  subscription: SaasSubscription | null;
}

export interface BillingService {
  plans(): readonly BillingPlan[];
  subscription(): Promise<SaasSubscription | undefined>;
  invoices(): Promise<SaasInvoice[]>;
  startTrial(input: z.input<typeof StartTrialInputSchema>): Promise<SaasSubscription>;
  checkout(input: CheckoutInput): Promise<BillingAttempt>;
  upgrade(input: CheckoutInput): Promise<BillingAttempt>;
  downgrade(input: CheckoutInput): Promise<BillingAttempt>;
  cancel(): Promise<SaasSubscription>;
  resume(): Promise<SaasSubscription>;
  applyTimelineEvent(event: DomainEvent, context: EventApplyContext): Promise<void>;
}

function addDays(instant: string, days: number): string {
  return new Date(Date.parse(instant) + days * 86_400_000).toISOString();
}

function addPeriod(instant: string, interval: BillingPlan['interval']): string {
  const start = new Date(instant);
  const originalDay = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + (interval === 'month' ? 1 : 12));
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
  ).getUTCDate();
  start.setUTCDate(Math.min(originalDay, lastDay));
  return start.toISOString();
}

function planTotal(plan: Pick<BillingPlan, 'unitAmountCents'>, seats: number): number {
  const total = plan.unitAmountCents * seats;
  if (!Number.isSafeInteger(total))
    throw new RangeError('The plan total exceeds safe integer cents.');
  return total;
}

function proratedCents(amount: number, from: string, to: string, at: string): number {
  const startMs = Date.parse(from);
  const endMs = Date.parse(to);
  const nowMs = Date.parse(at);
  const duration = endMs - startMs;
  if (duration <= 0) return 0;
  const remaining = Math.max(0, Math.min(duration, endMs - nowMs));
  const numerator = BigInt(amount) * BigInt(remaining);
  return Number((numerator + BigInt(Math.floor(duration / 2))) / BigInt(duration));
}

function buildInvoice(input: {
  organizationId: string;
  subscriptionId: string;
  status: SaasInvoice['status'];
  amountCents: number;
  currency: string;
  lines: SaasInvoice['lines'];
  periodStart: string;
  periodEnd: string;
  at: string;
}): SaasInvoice {
  return SaasInvoiceSchema.parse({
    id: createRuntimeId('invoice'),
    ...input,
    issuedAt: input.at,
    paidAt: input.status === 'paid' ? input.at : null,
  });
}

/**
 * Emit stable expiry events for trials whose end falls in this committed
 * advance. Prototypes can compose this with their own timeline:
 * `timeline: async (ctx) => [...await billingTimeline(ctx), ...events(ctx)]`.
 */
export async function billingTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const [subscriptions, organizations] = await Promise.all([
    ctx.read('saas_subscriptions'),
    ctx.read('py_organizations'),
  ]);
  const organizationIds = new Set(organizations.map((row) => row.id));
  const candidates = subscriptions
    .filter(
      (row) =>
        row.status === 'trialing' &&
        typeof row.trialEndsAt === 'string' &&
        Date.parse(row.trialEndsAt) >= ctx.from.getTime() &&
        Date.parse(row.trialEndsAt) <= ctx.to.getTime() &&
        typeof row.organizationId === 'string' &&
        organizationIds.has(row.organizationId)
    )
    .sort(
      (a, b) =>
        String(a.trialEndsAt).localeCompare(String(b.trialEndsAt)) || a.id.localeCompare(b.id)
    );

  const dayIndexes = new Map<string, number>();
  return candidates.map((row) => {
    const at = new Date(row.trialEndsAt as string);
    const day = at.toISOString().slice(0, 10);
    const index = dayIndexes.get(day) ?? 0;
    dayIndexes.set(day, index + 1);
    return {
      id: eventId(ctx.scenario.id, at, index),
      type: BILLING_TRIAL_EXPIRED_EVENT,
      at: at.toISOString(),
      payload: { organizationId: row.organizationId, subscriptionId: row.id },
      source: 'timeline',
    };
  });
}

/** Create the deterministic plan, checkout, subscription and invoice simulator. */
export function createBilling(
  runtime: PrototypeRuntime,
  catalog: readonly unknown[]
): BillingService {
  const plans = z.array(BillingPlanSchema).min(1).parse(catalog);
  const planIds = plans.map((plan) => plan.id);
  if (new Set(planIds).size !== planIds.length) throw new Error('Billing plan ids must be unique.');
  const byPlanId = new Map(plans.map((plan) => [plan.id, plan]));
  const db = runtime.db as BillingDatabase;
  const organizations = () => db.table<Organization>('py_organizations');
  const subscriptions = () => db.table<SaasSubscription>('saas_subscriptions');
  const invoices = () => db.table<SaasInvoice>('saas_invoices');
  const now = () => runtime.clock.now().toISOString();

  async function writeInboxMessage(
    input: Pick<SaasInboxMessage, 'recipient' | 'personaId' | 'kind' | 'subject' | 'body'>,
    at: string,
    id = createRuntimeId('inbox')
  ): Promise<SaasInboxMessage> {
    const message = SaasInboxMessageSchema.parse({
      id,
      ...input,
      action: null,
      at,
      readAt: null,
      archivedAt: null,
    });
    await db.rows<SaasInboxMessage>('saas_inbox').add(message);
    return message;
  }

  function organizationId(): string {
    const principal = runtime.session.principal();
    if (!principal?.organization) throw new Error('Billing requires an active organization.');
    return principal.organization.id;
  }

  function plan(planId: string): BillingPlan {
    const selected = byPlanId.get(planId);
    if (!selected) throw new Error(`Unknown billing plan "${planId}".`);
    return selected;
  }

  async function currentSubscription(orgId: string): Promise<SaasSubscription | undefined> {
    const rows = await db
      .rows<SaasSubscription>('saas_subscriptions')
      .where('organizationId')
      .equals(orgId)
      .toArray();
    return rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .find(
        (row) => row.status === 'trialing' || row.status === 'active' || row.status === 'past_due'
      );
  }

  async function currentOrganization(orgId: string): Promise<Organization> {
    const row = await organizations().get(orgId);
    if (!row) throw new Error(`Organization "${orgId}" was not found.`);
    return OrganizationSchema.parse(row);
  }

  function checked(): string {
    runtime.session.assert(BILLING_CAPABILITY);
    return organizationId();
  }

  async function updateOrganization(
    organization: Organization,
    changes: Partial<Organization>
  ): Promise<Organization> {
    const updated = OrganizationSchema.parse({ ...organization, ...changes });
    await organizations().put(updated);
    return updated;
  }

  async function startTrial(
    input: z.input<typeof StartTrialInputSchema>
  ): Promise<SaasSubscription> {
    const orgId = checked();
    const data = parseInput(StartTrialInputSchema, input);
    const selected = plan(data.planId);
    const at = now();
    const trialEndsAt = addDays(at, data.trialDays ?? selected.trialDays);
    const result = await runtime.environment.run('billing.startTrial', () =>
      db.transaction('rw', ['py_organizations', 'saas_subscriptions'], async () => {
        const organization = await currentOrganization(orgId);
        const active = await currentSubscription(orgId);
        if (active) throw new Error('An active subscription or trial already exists.');
        const subscription = SaasSubscriptionSchema.parse({
          id: createRuntimeId('sub'),
          organizationId: orgId,
          planId: selected.id,
          status: 'trialing',
          interval: selected.interval,
          seats: data.seats ?? organization.seats ?? organization.size,
          unitAmountCents: selected.unitAmountCents,
          currency: selected.currency,
          trialEndsAt,
          currentPeriodStart: at,
          currentPeriodEnd: trialEndsAt,
          cancelAtPeriodEnd: false,
          createdAt: at,
        });
        await subscriptions().add(subscription);
        await updateOrganization(organization, {
          plan: selected.id,
          billingStatus: 'trialing',
          trialEndsAt,
          seats: subscription.seats,
          billingInterval: selected.interval,
          currentPeriodEnd: trialEndsAt,
        });
        return subscription;
      })
    );
    await runtime.session.refresh();
    return result;
  }

  async function checkoutWithDirection(
    input: CheckoutInput,
    direction?: 'upgrade' | 'downgrade'
  ): Promise<BillingAttempt> {
    const orgId = checked();
    const data = parseInput(CheckoutInputSchema, input);
    const selected = plan(data.planId);
    const at = now();
    const result = await runtime.environment.run('billing.checkout', () =>
      db.transaction('rw', BILLING_TABLES, async () => {
        const organization = await currentOrganization(orgId);
        const current = await currentSubscription(orgId);
        if (direction && !current) throw new Error(`Cannot ${direction} without a subscription.`);
        if (current && current.currency !== selected.currency) {
          throw new Error('Changing plan currency is not supported by the billing simulator.');
        }
        const currentAnnual = current
          ? BigInt(current.unitAmountCents) * BigInt(current.interval === 'month' ? 12 : 1)
          : 0n;
        const targetAnnual =
          BigInt(selected.unitAmountCents) * BigInt(selected.interval === 'month' ? 12 : 1);
        if (direction === 'upgrade' && targetAnnual <= currentAnnual) {
          throw new Error('The selected plan is not an upgrade.');
        }
        if (direction === 'downgrade' && targetAnnual >= currentAnnual) {
          throw new Error('The selected plan is not a downgrade.');
        }
        if (data.outcome !== 'success' && !current) {
          throw new Error(
            'A failed checkout attempt requires an existing subscription for its invoice.'
          );
        }

        const seats = current?.seats ?? organization.seats ?? organization.size;
        const trialConversion = current?.status === 'trialing';
        const periodStart = current && !trialConversion ? current.currentPeriodStart : at;
        const periodEnd =
          current && !trialConversion ? current.currentPeriodEnd : addPeriod(at, selected.interval);
        const lines =
          current && !trialConversion
            ? [
                {
                  description: `Unused ${current.planId} plan time`,
                  amountCents: -proratedCents(
                    planTotal(current, seats),
                    periodStart,
                    periodEnd,
                    at
                  ),
                },
                {
                  description: `Remaining ${selected.id} plan time`,
                  amountCents: proratedCents(
                    planTotal(selected, seats),
                    periodStart,
                    periodEnd,
                    at
                  ),
                },
              ]
            : [{ description: `${selected.name} plan`, amountCents: planTotal(selected, seats) }];
        const amountCents = lines.reduce((total, line) => total + line.amountCents, 0);
        if (!Number.isSafeInteger(amountCents))
          throw new RangeError('The invoice exceeds safe integer cents.');
        const invoiceStatus: SaasInvoice['status'] =
          data.outcome === 'success' ? 'paid' : data.outcome === 'declined' ? 'failed' : 'open';
        const invoice = buildInvoice({
          organizationId: orgId,
          subscriptionId: current?.id ?? createRuntimeId('sub'),
          status: invoiceStatus,
          amountCents,
          currency: selected.currency,
          lines,
          periodStart,
          periodEnd,
          at,
        });

        if (data.outcome !== 'success') {
          await invoices().add(invoice);
          return {
            attempt: { outcome: data.outcome, invoice, subscription: current ?? null },
            changed: false,
          };
        }

        const updatedSubscription = current
          ? SaasSubscriptionSchema.parse({
              ...current,
              planId: selected.id,
              status: 'active',
              interval: selected.interval,
              unitAmountCents: selected.unitAmountCents,
              currency: selected.currency,
              trialEndsAt: null,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            })
          : SaasSubscriptionSchema.parse({
              id: invoice.subscriptionId,
              organizationId: orgId,
              planId: selected.id,
              status: 'active',
              interval: selected.interval,
              seats,
              unitAmountCents: selected.unitAmountCents,
              currency: selected.currency,
              trialEndsAt: null,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              createdAt: at,
            });
        await (current
          ? subscriptions().put(updatedSubscription)
          : subscriptions().add(updatedSubscription));
        await invoices().add(invoice);
        await updateOrganization(organization, {
          plan: selected.id,
          billingStatus: 'active',
          trialEndsAt: null,
          seats,
          billingInterval: selected.interval,
          currentPeriodEnd: periodEnd,
        });
        if (invoice.amountCents > 0) {
          const principal = runtime.session.principal();
          const recipient =
            principal?.persona.email && isExampleEmail(principal.persona.email)
              ? principal.persona.email
              : 'billing@example.com';
          await writeInboxMessage(
            {
              recipient,
              kind: 'receipt',
              subject: `Receipt for ${selected.name}`,
              body: `Simulated payment of ${invoice.amountCents} ${invoice.currency} cents was recorded.`,
              personaId: principal?.persona.id ?? null,
            },
            at
          );
        }
        return {
          attempt: { outcome: data.outcome, invoice, subscription: updatedSubscription },
          changed: true,
        };
      })
    );
    if (result.changed) await runtime.session.refresh();
    return result.attempt;
  }

  async function cancel(): Promise<SaasSubscription> {
    const orgId = checked();
    const updated = await runtime.environment.run('billing.cancel', () =>
      db.transaction('rw', ['saas_subscriptions'], async () => {
        const current = await currentSubscription(orgId);
        if (!current) throw new Error('No active subscription to cancel.');
        const next = SaasSubscriptionSchema.parse({ ...current, cancelAtPeriodEnd: true });
        await subscriptions().put(next);
        return next;
      })
    );
    return updated;
  }

  async function resume(): Promise<SaasSubscription> {
    const orgId = checked();
    return runtime.environment.run('billing.resume', () =>
      db.transaction('rw', ['saas_subscriptions'], async () => {
        const current = await currentSubscription(orgId);
        if (!current) throw new Error('No subscription to resume.');
        const next = SaasSubscriptionSchema.parse({ ...current, cancelAtPeriodEnd: false });
        await subscriptions().put(next);
        return next;
      })
    );
  }

  async function applyTimelineEvent(event: DomainEvent, context: EventApplyContext): Promise<void> {
    if (event.type !== BILLING_TRIAL_EXPIRED_EVENT) return;
    const payload = z
      .object({ organizationId: z.string().min(1), subscriptionId: z.string().min(1) })
      .parse(event.payload);
    const subscription = await context.get('saas_subscriptions', payload.subscriptionId);
    if (subscription?.status !== 'trialing' || subscription.trialEndsAt !== event.at) return;
    const organization = await context.get('py_organizations', payload.organizationId);
    if (!organization) return;

    const expiredSubscription = SaasSubscriptionSchema.parse({
      ...subscription,
      status: 'expired',
    });
    const expiredOrganization = OrganizationSchema.parse({
      ...organization,
      billingStatus: 'expired',
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: event.at,
    });
    await context.put('saas_subscriptions', expiredSubscription);
    await context.put('py_organizations', expiredOrganization);

    const memberships = await db
      .rows<{ personaId: string; role: string }>('py_memberships')
      .where('organizationId')
      .equals(payload.organizationId)
      .toArray();
    const owner = memberships.find((membership) => membership.role === 'owner');
    const ownerPersona = owner
      ? await db.rows<{ id: string; email?: string }>('py_personas').get(owner.personaId)
      : undefined;
    const recipient =
      ownerPersona?.email && isExampleEmail(ownerPersona.email)
        ? ownerPersona.email
        : 'billing@example.com';
    await writeInboxMessage(
      {
        recipient,
        kind: 'trial',
        subject: 'Your simulated trial has ended',
        body: `The ${subscription.planId} trial for ${expiredOrganization.name} ended. Choose a plan to continue (simulated).`,
        personaId: ownerPersona?.id ?? null,
      },
      event.at,
      `inbox:${event.id}`
    );
  }

  return {
    plans: () => plans,
    subscription: async () => currentSubscription(organizationId()),
    invoices: async () => {
      const orgId = organizationId();
      return (
        await db.rows<SaasInvoice>('saas_invoices').where('organizationId').equals(orgId).toArray()
      ).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id.localeCompare(a.id));
    },
    startTrial,
    checkout: (input) => checkoutWithDirection(input),
    upgrade: (input) => checkoutWithDirection(input, 'upgrade'),
    downgrade: (input) => checkoutWithDirection(input, 'downgrade'),
    cancel,
    resume,
    applyTimelineEvent,
  };
}
