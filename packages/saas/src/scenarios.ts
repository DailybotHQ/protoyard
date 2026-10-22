import { createAvatarPool } from '@protoyard/avatars';
import type {
  GenerateContext,
  IntegrityRules,
  Membership,
  Organization,
  Persona,
  PrototypeRuntime,
  Row,
  Scenario,
} from '@protoyard/core';
import type { ScenarioFragment } from '@protoyard/scenarios';
import {
  type SaasAccount,
  type SaasInboxMessage,
  type SaasInvitation,
  type SaasInvoice,
  type SaasMfa,
  type SaasProvider,
  type SaasSubscription,
  type SaasTableName,
  type SaasToken,
  saasIntegrity,
  saasTables,
} from './schema.ts';

/**
 * SaaS scenario fragments and a deterministic world generator (ADR-006,
 * ADR-018). Fragments only set knobs under `scenario.generators.saas`;
 * `generateSaasWorld(ctx, { team })` turns them into kit rows using nothing
 * but `ctx.ids`, `ctx.rng`, `ctx.faker` and `ctx.time`, so the same seed
 * always rebuilds the same accounts, tokens, invitations and billing.
 *
 * Compose them like any other fragment:
 * `composeScenario(PRESETS['first-week'], saasFragments.trialEnding(2), { id: 'trial-ending' })`.
 */

/** Bump when the same knobs and seed can produce different kit rows. */
export const SAAS_GENERATOR_VERSION = 2;

/** The simulated password every generated account uses (shown on the sign-in screen as a hint). */
export const SAAS_DEMO_PASSWORD = 'demo-password';

export interface SaasScenarioKnobs {
  /** Start signed out (applied by `applySaasScenarioSession`). */
  signedOut?: boolean;
  /** The actor's email is not confirmed yet; a verify-email token and message exist. */
  unverifiedEmail?: boolean;
  /** The actor has a simulated authenticator enrolled (with recovery codes). */
  mfaEnrolled?: boolean;
  /** Pending invitations to new people (each with a token and an inbox message). */
  pendingInvites?: number;
  /** A trial that ends this many days after the reference time. */
  trialEndsInDays?: number;
  /** The last payment failed: subscription `past_due` plus a failed invoice. */
  pastDue?: boolean;
  /** Total workspaces the actor belongs to (1 = only the scenario organization). */
  workspaces?: number;
  /** Providers already linked to the actor's account. */
  oauthLinked?: readonly SaasProvider[];
}

const knob = (saas: SaasScenarioKnobs): ScenarioFragment =>
  ({ generators: { saas } }) as ScenarioFragment;

/** One fragment per SaaS axis. Fragments compose: later knobs win per key. */
export const saasFragments = {
  signedOut: (): ScenarioFragment =>
    ({ ...knob({ signedOut: true }), tags: ['signed-out'] }) as ScenarioFragment,
  unverifiedEmail: (): ScenarioFragment =>
    ({ ...knob({ unverifiedEmail: true }), tags: ['unverified-email'] }) as ScenarioFragment,
  mfaEnrolled: (): ScenarioFragment =>
    ({ ...knob({ mfaEnrolled: true }), tags: ['mfa'] }) as ScenarioFragment,
  pendingInvite: (count = 1): ScenarioFragment =>
    ({ ...knob({ pendingInvites: count }), tags: ['invites'] }) as ScenarioFragment,
  trialEnding: (days: number): ScenarioFragment =>
    ({
      ...knob({ trialEndsInDays: days }),
      organization: { subscription: 'trial' },
      tags: ['billing', 'trial'],
    }) as ScenarioFragment,
  pastDue: (): ScenarioFragment =>
    ({
      ...knob({ pastDue: true }),
      organization: { subscription: 'pro' },
      tags: ['billing', 'past-due'],
    }) as ScenarioFragment,
  multiWorkspace: (count: number): ScenarioFragment =>
    ({ ...knob({ workspaces: count }), tags: ['workspaces'] }) as ScenarioFragment,
  oauthLinked: (...providers: SaasProvider[]): ScenarioFragment =>
    ({ ...knob({ oauthLinked: providers }), tags: ['oauth'] }) as ScenarioFragment,
} as const;

/** The SaaS knobs of a resolved scenario (empty object when none). */
export function saasKnobs(scenario: Pick<Scenario, 'generators'>): SaasScenarioKnobs {
  const value = scenario.generators?.saas;
  return typeof value === 'object' && value !== null ? (value as SaasScenarioKnobs) : {};
}

export interface SaasPlanPrice {
  id: string;
  unitAmountCents: number;
  interval?: 'month' | 'year';
  currency?: string;
}

export interface GenerateSaasWorldOptions {
  /** The scenario team (from `generateTeam(ctx)`); generate it first, as usual. */
  team: {
    organizations: Organization[];
    personas: Persona[];
    memberships: Membership[];
    organization: Organization;
    actor: Persona;
  };
  /** Paid plan prices by subscription status (defaults: pro 1,200¢, enterprise 4,500¢ per seat/month). */
  plans?: { pro?: SaasPlanPrice; enterprise?: SaasPlanPrice };
  /** Kit tables the prototype opted into (default: all). Rows for others are not produced. */
  tables?: readonly SaasTableName[];
}

export interface SaasWorld {
  organizations: Organization[];
  personas: Persona[];
  memberships: Membership[];
  /** Kit tables, every selected table present (empty when unused). */
  tables: Record<string, Row[]>;
}

const DEFAULT_PLANS = {
  pro: { id: 'pro', unitAmountCents: 1200, interval: 'month', currency: 'USD' },
  enterprise: { id: 'enterprise', unitAmountCents: 4500, interval: 'month', currency: 'USD' },
} as const satisfies Record<string, Required<SaasPlanPrice>>;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Builds kit rows for the scenario's knobs on top of the team. Returns the
 * team's identities (patched: extra workspaces, billing fields) and the kit
 * tables. Pure and deterministic for the same context.
 */
export function generateSaasWorld(
  ctx: GenerateContext,
  options: GenerateSaasWorldOptions
): SaasWorld {
  const knobs = saasKnobs(ctx.scenario);
  const selected = new Set<SaasTableName>(
    options.tables ?? [
      'saas_accounts',
      'saas_sessions_log',
      'saas_tokens',
      'saas_mfa',
      'saas_invitations',
      'saas_inbox',
      'saas_subscriptions',
      'saas_invoices',
      'saas_onboarding',
    ]
  );
  const rng = ctx.rng.fork('protoyard:saas');
  const nowMs = ctx.time.now.getTime();
  const { team } = options;
  const actor = team.actor;
  const organizations = team.organizations.map((o) => ({ ...o }));
  const personas = team.personas.map((p) => ({ ...p }));
  // Faces for people this kit adds (and team members without one) come from
  // their own fork and skip the team's faces until the library runs out.
  const avatars = createAvatarPool(ctx.rng.fork('protoyard:avatars:saas'), {
    avoid: personas.map((p) => p.avatar),
  });
  for (const persona of personas) persona.avatar ??= avatars.next();
  const memberships = team.memberships.map((m) => ({ ...m }));
  const primary = organizations.find((o) => o.id === team.organization.id) as Organization;
  const orgCreatedMs = Date.parse(primary.createdAt);
  /** A past instant between `fromMs` and now, from the child (seeded) rng only. */
  const pastBetween = (fromMs: number) =>
    iso(fromMs + Math.floor(rng.next() * Math.max(0, nowMs - fromMs)));

  const accounts: SaasAccount[] = [];
  const tokens: SaasToken[] = [];
  const mfa: SaasMfa[] = [];
  const invitations: SaasInvitation[] = [];
  const inbox: SaasInboxMessage[] = [];
  const subscriptions: SaasSubscription[] = [];
  const invoices: SaasInvoice[] = [];

  // Accounts: one per persona, verified, with the demo password.
  for (const persona of personas) {
    const isActor = persona.id === actor.id;
    const email = (persona.email ?? `${persona.id}@example.com`).toLowerCase();
    const joinedMs = Date.parse(persona.joinedAt);
    const linkedAt = iso(Math.max(joinedMs, nowMs - DAY));
    accounts.push({
      id: ctx.ids.next('acct'),
      personaId: persona.id,
      email,
      emailVerified: !(isActor && knobs.unverifiedEmail),
      simulatedPassword: SAAS_DEMO_PASSWORD,
      providers:
        isActor && knobs.oauthLinked
          ? knobs.oauthLinked.map((provider) => ({
              provider,
              subject: `${provider}-${persona.id}`,
              email,
              linkedAt,
            }))
          : [],
      status: 'active',
      failedAttempts: 0,
      createdAt: persona.joinedAt,
      lastSignInAt: isActor && knobs.unverifiedEmail ? null : pastBetween(joinedMs),
    });
  }
  const actorAccount = accounts.find((a) => a.personaId === actor.id) as SaasAccount;

  if (knobs.unverifiedEmail) {
    const createdAt = actorAccount.createdAt;
    const token: SaasToken = {
      id: ctx.ids.next('verify'),
      kind: 'verify-email',
      email: actorAccount.email,
      accountId: actorAccount.id,
      payload: {},
      createdAt,
      expiresAt: iso(Math.max(Date.parse(createdAt), nowMs) + DAY),
      consumedAt: null,
    };
    tokens.push(token);
    inbox.push({
      id: ctx.ids.next('inbox'),
      recipient: actorAccount.email,
      personaId: actor.id,
      kind: 'verify-email',
      subject: 'Confirm your email',
      body: `Hi ${actor.name}, confirm your email address to finish creating your account. This is a simulated message: nothing was sent.`,
      action: { label: 'Confirm email', href: `#/auth/verify?token=${token.id}` },
      at: createdAt,
      readAt: null,
      archivedAt: null,
    });
  }

  if (knobs.mfaEnrolled) {
    const enrolledAt = pastBetween(Date.parse(actorAccount.createdAt));
    mfa.push({
      id: ctx.ids.next('mfa'),
      accountId: actorAccount.id,
      method: 'totp-sim',
      seed: Array.from(
        { length: 16 },
        () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rng.int(0, 31)]
      ).join(''),
      status: 'active',
      enrolledAt,
      recoveryCodes: Array.from({ length: 8 }, () => ({
        code: `${rng.int(10000, 99999)}-${rng.int(10000, 99999)}`,
        usedAt: null,
      })),
    });
  }

  for (let i = 0; i < (knobs.pendingInvites ?? 0); i++) {
    const first = ctx.faker.person.firstName();
    const last = ctx.faker.person.lastName();
    const email = `${first}.${last}`
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9.]+/g, '')
      .concat(`${i + 1}@example.com`);
    const createdAt = pastBetween(Math.max(orgCreatedMs, nowMs - 5 * DAY));
    const token: SaasToken = {
      id: ctx.ids.next('invite-token'),
      kind: 'invite',
      email,
      accountId: null,
      payload: {},
      createdAt,
      expiresAt: iso(Date.parse(createdAt) + 7 * DAY),
      consumedAt: null,
    };
    const invitation: SaasInvitation = {
      id: ctx.ids.next('inv'),
      organizationId: primary.id,
      email,
      role: rng.chance(0.25) ? 'admin' : 'member',
      invitedBy: actor.id,
      tokenId: token.id,
      status: 'pending',
      createdAt,
      expiresAt: token.expiresAt,
      acceptedAt: null,
      acceptedBy: null,
      avatar: avatars.next(),
    };
    token.payload = { invitationId: invitation.id, organizationId: primary.id };
    tokens.push(token);
    invitations.push(invitation);
    inbox.push({
      id: ctx.ids.next('inbox'),
      recipient: email,
      personaId: null,
      kind: 'invite',
      subject: `${actor.name} invited you to ${primary.name}`,
      body: `${actor.name} invited you to join ${primary.name}. This is a simulated message: nothing was sent.`,
      action: { label: 'Accept invitation', href: `#/invites/accept?token=${token.id}` },
      at: createdAt,
      readAt: null,
      archivedAt: null,
    });
  }

  // Extra workspaces the actor belongs to (owner of the first extra, admin of the rest).
  for (let i = 1; i < Math.max(1, knobs.workspaces ?? 1); i++) {
    const createdMs = Math.max(orgCreatedMs, nowMs - rng.int(7, 120) * DAY);
    const organization: Organization = {
      ...primary,
      id: ctx.ids.next('workspace'),
      name: `${ctx.faker.company.name()}`,
      createdAt: iso(createdMs),
      size: 1,
      seats: 1,
      plan: 'free',
      billingStatus: 'none',
      trialEndsAt: null,
      billingInterval: null,
      currentPeriodEnd: null,
      featureFlags: {},
    };
    organizations.push(organization);
    memberships.push({
      id: ctx.ids.next('mem'),
      personaId: actor.id,
      organizationId: organization.id,
      role: i === 1 ? 'owner' : 'admin',
      joinedAt: iso(Math.max(createdMs, Date.parse(actor.joinedAt))),
      capabilities: [],
    });
  }

  // Billing for the scenario organization.
  const status = ctx.scenario.organization.subscription;
  const plans = { ...DEFAULT_PLANS, ...options.plans };
  const seats = Math.max(1, primary.size);
  if (status === 'trial' || knobs.trialEndsInDays !== undefined) {
    const days = knobs.trialEndsInDays ?? 7;
    const trialEndsAt = iso(nowMs + days * DAY);
    const startMs = Math.max(orgCreatedMs, nowMs - Math.max(0, 14 - days) * DAY);
    const plan = plans.pro;
    subscriptions.push({
      id: ctx.ids.next('sub'),
      organizationId: primary.id,
      planId: plan.id,
      status: 'trialing',
      interval: plan.interval ?? 'month',
      seats,
      unitAmountCents: plan.unitAmountCents,
      currency: plan.currency ?? 'USD',
      trialEndsAt,
      currentPeriodStart: iso(startMs),
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
      createdAt: iso(startMs),
    });
    Object.assign(primary, {
      plan: plan.id,
      billingStatus: 'trialing',
      trialEndsAt,
      seats,
      billingInterval: plan.interval ?? 'month',
      currentPeriodEnd: trialEndsAt,
    });
    if (days <= 3) {
      inbox.push({
        id: ctx.ids.next('inbox'),
        recipient: actorAccount.email,
        personaId: actor.id,
        kind: 'trial',
        subject:
          days <= 0
            ? 'Your trial ends today'
            : `Your trial ends in ${days} ${days === 1 ? 'day' : 'days'}`,
        body: 'Choose a plan to keep your workspace on Pro. This is a simulated message: nothing was sent.',
        action: { label: 'Choose a plan', href: '#/billing' },
        at: iso(Math.max(startMs, nowMs - DAY)),
        readAt: null,
        archivedAt: null,
      });
    }
  } else if (status === 'pro' || status === 'enterprise' || status === 'expired') {
    const plan = status === 'enterprise' ? plans.enterprise : plans.pro;
    const interval = plan.interval ?? 'month';
    const periodMs = (interval === 'month' ? 30 : 365) * DAY;
    // Whole periods since the organization started, newest last (at most 3 invoices).
    const periods = Math.max(1, Math.min(3, Math.floor((nowMs - orgCreatedMs) / periodMs)));
    const firstStartMs = Math.max(
      orgCreatedMs,
      nowMs - periods * periodMs + Math.floor(periodMs / 3)
    );
    const subscriptionId = ctx.ids.next('sub');
    const lapsed = status === 'expired';
    const currentStartMs = firstStartMs + (periods - 1) * periodMs;
    const currentEndMs = lapsed
      ? Math.min(nowMs - DAY, currentStartMs + periodMs)
      : currentStartMs + periodMs;
    const subStatus: SaasSubscription['status'] = lapsed
      ? 'expired'
      : knobs.pastDue
        ? 'past_due'
        : 'active';
    subscriptions.push({
      id: subscriptionId,
      organizationId: primary.id,
      planId: plan.id,
      status: subStatus,
      interval,
      seats,
      unitAmountCents: plan.unitAmountCents,
      currency: plan.currency ?? 'USD',
      trialEndsAt: null,
      currentPeriodStart: iso(currentStartMs),
      currentPeriodEnd: iso(currentEndMs),
      cancelAtPeriodEnd: false,
      createdAt: iso(firstStartMs),
    });
    for (let p = 0; p < periods; p++) {
      const startMs = firstStartMs + p * periodMs;
      const isLast = p === periods - 1;
      const failed = isLast && knobs.pastDue === true;
      invoices.push({
        id: ctx.ids.next('invoice'),
        organizationId: primary.id,
        subscriptionId,
        status: failed ? 'failed' : 'paid',
        amountCents: plan.unitAmountCents * seats,
        currency: plan.currency ?? 'USD',
        lines: [
          { description: `${plan.id} plan × ${seats}`, amountCents: plan.unitAmountCents * seats },
        ],
        periodStart: iso(startMs),
        periodEnd: iso(startMs + periodMs),
        issuedAt: iso(startMs),
        paidAt: failed ? null : iso(startMs),
      });
    }
    Object.assign(primary, {
      plan: plan.id,
      billingStatus: lapsed ? 'expired' : knobs.pastDue ? 'past_due' : 'active',
      seats,
      billingInterval: interval,
      currentPeriodEnd: iso(currentEndMs),
    });
    if (knobs.pastDue) {
      inbox.push({
        id: ctx.ids.next('inbox'),
        recipient: actorAccount.email,
        personaId: actor.id,
        kind: 'receipt',
        subject: 'Your payment failed',
        body: 'We could not charge the simulated payment method. Update it to keep your plan. This is a simulated message: nothing was sent.',
        action: { label: 'Update billing', href: '#/billing' },
        at: iso(currentStartMs),
        readAt: null,
        archivedAt: null,
      });
    }
  }

  const rows: Record<SaasTableName, Row[]> = {
    saas_accounts: accounts as unknown as Row[],
    saas_sessions_log: [],
    saas_tokens: tokens as unknown as Row[],
    saas_mfa: mfa as unknown as Row[],
    saas_invitations: invitations as unknown as Row[],
    saas_inbox: inbox as unknown as Row[],
    saas_subscriptions: subscriptions as unknown as Row[],
    saas_invoices: invoices as unknown as Row[],
    saas_onboarding: [],
  };
  const tables = saasTables(
    Object.fromEntries([...selected].map((table) => [table, rows[table]])) as never,
    { tables: [...selected] }
  );
  return { organizations, personas, memberships, tables };
}

/** Integrity rules for the kit tables a prototype generates with {@link generateSaasWorld}. */
export function saasScenarioIntegrity(tables?: readonly SaasTableName[]): IntegrityRules {
  return saasIntegrity(tables ? { tables } : {});
}

/** Minimal Dexie surface for the session marker. */
interface SessionLogDb {
  table(name: string): {
    get(id: string): Promise<unknown>;
    put(row: unknown): Promise<unknown>;
  };
}

/**
 * Applies the `signedOut` knob once per scenario load. The runtime decides
 * signed-in vs signed-out per prototype (`auth.signedOutByDefault`), so a
 * "signed-out visitor" scenario in an otherwise signed-in prototype needs
 * this nudge. Call it after boot and on every scenario change
 * (`runtime.scenarios.subscribe`). A marker row in `saas_sessions_log`
 * (keyed by the load time; cleared by the next load) makes it idempotent:
 * someone who signs in afterwards stays signed in across reloads.
 * Returns true when it signed out.
 */
export async function applySaasScenarioSession(runtime: PrototypeRuntime): Promise<boolean> {
  const active = runtime.scenarios.active();
  if (!active || !saasKnobs(active.scenario).signedOut) return false;
  const db = runtime.db as unknown as SessionLogDb;
  const markerId = `scenario-signed-out:${active.loadedAt}`;
  if (await db.table('saas_sessions_log').get(markerId)) return false;
  await db.table('saas_sessions_log').put({
    id: markerId,
    accountId: null,
    personaId: runtime.session.principal()?.persona.id ?? null,
    method: 'sign-out',
    provider: null,
    outcome: 'success',
    reason: 'scenario',
    at: runtime.clock.now().toISOString(),
  });
  if (!runtime.session.isSignedIn()) return false;
  await runtime.session.signOut();
  return true;
}
