import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type WorldSeed,
} from '@protoyard/core';
import type {
  Plan,
  Region,
  Subscription,
  SubscriptionStatus,
  Tenant,
  TenantStatus,
  UserAccess,
} from '../database/schema.ts';
import type { AuditEvent, AuditType } from '../domain/services.ts';
import type { AdminGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` and every date from `ctx.time`, so the same scenario renders
 * the same console everywhere. Order: staff → tenants → people → billing → audit.
 */

/** Bump when the same seed would produce a different world. */
export const ADMIN_GENERATOR_VERSION = 1;

/** Fixed staff, so links like `?actor=user_0003` always mean the same person. */
const STAFF = [
  {
    id: 'user_0001',
    name: 'Morgan Reyes',
    title: 'Platform owner',
    role: 'owner',
    color: '#0f766e',
  },
  { id: 'user_0002', name: 'Dana Okafor', title: 'Support lead', role: 'admin', color: '#7c3aed' },
  { id: 'user_0003', name: 'Sam Patel', title: 'Support agent', role: 'member', color: '#0891b2' },
  {
    id: 'user_0004',
    name: 'Ines Duarte',
    title: 'Compliance auditor',
    role: 'viewer',
    color: '#d97706',
  },
] as const;

/** Per-seat monthly price in integer cents. */
export const PLAN_PRICES: Record<Plan, number> = { starter: 900, growth: 2400, enterprise: 6500 };
const PLAN_WEIGHTS: [Plan, number][] = [
  ['starter', 5],
  ['growth', 4],
  ['enterprise', 1],
];
const REGION_LIST: readonly Region[] = ['us-east', 'eu-west', 'ap-south'];

const DEFAULTS: AdminGeneratorOptions = { tenants: 24, suspendedShare: 0.08, pastDueShare: 0.1 };

export function generateAdminWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, faker, ids, time } = ctx;
  const options = { ...DEFAULTS, ...(scenario.generators.admin as Partial<AdminGeneratorOptions>) };
  const nowMs = time.now.getTime();
  const iso = (ms: number) => new Date(Math.min(ms, nowMs)).toISOString();
  const between = (fromMs: number, toMs = nowMs) =>
    iso(fromMs + Math.floor(rng.next() * Math.max(0, toMs - fromMs)));

  // Staff organization and people.
  const staffOrgCreated = nowMs - scenario.organization.ageDays * MS_PER_DAY;
  const staffOrg: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Ops',
    type: 'internal',
    plan: 'enterprise',
    billingStatus: 'none',
    createdAt: iso(staffOrgCreated),
    size: STAFF.length,
    featureFlags: {},
    trialEndsAt: null,
    seats: STAFF.length,
    billingInterval: null,
    currentPeriodEnd: null,
  };
  const organizations: Organization[] = [staffOrg];
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  for (const person of STAFF) {
    const isActor = person.id === scenario.actor.id;
    const joinedMs = isActor
      ? nowMs - scenario.actor.joinedDaysAgo * MS_PER_DAY
      : staffOrgCreated + rng.int(0, 60) * MS_PER_DAY;
    const joinedAt = iso(Math.max(staffOrgCreated, joinedMs));
    personas.push({
      id: person.id,
      name: person.name,
      email: `${person.name.toLowerCase().replace(/\s+/g, '.')}@northwind.example`,
      title: person.title,
      avatarColor: person.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${person.title} · staff`,
    });
    memberships.push({
      id: ids.next('mem'),
      personaId: person.id,
      organizationId: staffOrg.id,
      role: isActor ? scenario.actor.role : person.role,
      joinedAt,
      capabilities: [],
    });
  }

  const tenants: Tenant[] = [];
  const access: UserAccess[] = [];
  const subscriptions: Subscription[] = [];
  const events: AuditEvent[] = [];
  const staffIds = STAFF.filter((s) => s.role !== 'viewer').map((s) => s.id);
  const auditEvent = (
    type: AuditType,
    at: string,
    message: string,
    tenantId: string,
    targetId: string | null = null
  ): AuditEvent => ({
    id: ids.next('audit'),
    type,
    at,
    actorId: rng.pick(staffIds),
    payload: { message, tenantId, targetId },
    source: 'seed',
  });

  for (let t = 0; t < options.tenants; t++) {
    const id = ids.next('tenant');
    const company = faker.company.name();
    const slug =
      company
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || id;
    const domain = `${slug}.example`;
    const createdMs = nowMs - rng.int(2, 360) * MS_PER_DAY;
    const createdAt = iso(Math.max(staffOrgCreated, createdMs));
    const plan = rng.weighted(PLAN_WEIGHTS);
    const roll = rng.next();
    let status: TenantStatus =
      roll < 0.08
        ? 'churned'
        : roll < 0.2
          ? 'trialing'
          : rng.chance(options.suspendedShare)
            ? 'suspended'
            : 'active';
    if (status === 'trialing' && Date.parse(createdAt) < nowMs - 30 * MS_PER_DAY) status = 'active';
    const suspendedAt = status === 'suspended' ? between(Date.parse(createdAt)) : null;

    const people = rng.int(2, 6);
    organizations.push({
      id,
      name: company,
      type: 'tenant',
      plan,
      billingStatus:
        status === 'trialing' ? 'trialing' : status === 'churned' ? 'expired' : 'active',
      createdAt,
      size: people,
      featureFlags: {},
      trialEndsAt: null,
      seats: people,
      billingInterval: 'month',
      currentPeriodEnd: null,
    });
    tenants.push({
      id,
      organizationId: id,
      name: company,
      domain,
      plan,
      status,
      region: rng.pick(REGION_LIST),
      createdAt,
      suspendedAt,
      suspendedReason: suspendedAt
        ? rng.pick([
            'Chargeback under review',
            'Abuse report: spam invites',
            'Security review requested',
            'Unpaid invoices for 60 days',
          ])
        : null,
      updatedAt: suspendedAt ?? createdAt,
    });
    events.push(auditEvent('tenant.created', createdAt, `Created ${company}`, id));

    for (let p = 0; p < people; p++) {
      const first = faker.person.firstName();
      const last = faker.person.lastName();
      const personaId = ids.next('tuser');
      const joinedAt = p === 0 ? createdAt : between(Date.parse(createdAt));
      personas.push({
        id: personaId,
        name: `${first} ${last}`,
        email: `${`${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '')}@${domain}`,
        title: p === 0 ? 'Account owner' : faker.person.jobTitle(),
        locale: 'en-US',
        timezone: 'UTC',
        joinedAt,
        onboardingComplete: true,
        preferences: {},
        summary: `${company} · tenant ${p === 0 ? 'owner' : 'user'}`,
      });
      memberships.push({
        id: ids.next('mem'),
        personaId,
        organizationId: id,
        role: p === 0 ? 'tenant_owner' : rng.chance(0.25) ? 'tenant_admin' : 'tenant_member',
        joinedAt,
        capabilities: [],
      });
      const disabled = status !== 'churned' && p > 0 && rng.chance(0.06);
      const lastSeenAt = between(Date.parse(joinedAt));
      access.push({
        id: personaId,
        personaId,
        tenantId: id,
        disabled,
        lastSeenAt,
        updatedAt: lastSeenAt,
      });
      if (disabled)
        events.push(
          auditEvent('user.disabled', lastSeenAt, `Disabled ${first} ${last}`, id, personaId)
        );
    }

    const subStatus: SubscriptionStatus =
      status === 'churned'
        ? 'canceled'
        : status === 'trialing'
          ? 'trialing'
          : rng.chance(options.pastDueShare)
            ? 'past_due'
            : 'active';
    const renewsAt = new Date(nowMs + rng.int(1, 30) * MS_PER_DAY).toISOString();
    subscriptions.push({
      id: ids.next('sub'),
      tenantId: id,
      plan,
      status: subStatus,
      mrrCents:
        subStatus === 'canceled' || subStatus === 'trialing' ? 0 : PLAN_PRICES[plan] * people,
      seats: people,
      renewsAt,
      cancelAtPeriodEnd: subStatus === 'active' && rng.chance(0.08),
      createdAt,
      updatedAt: createdAt,
    });
    if (subStatus === 'active' && Date.parse(createdAt) < nowMs - 30 * MS_PER_DAY) {
      events.push(
        auditEvent(
          'subscription.renewed',
          between(nowMs - 30 * MS_PER_DAY),
          `Renewed ${company}'s ${plan} plan`,
          id
        )
      );
    }
    if (suspendedAt)
      events.push(auditEvent('tenant.suspended', suspendedAt, `Suspended ${company}`, id));
  }

  events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return {
    organizations,
    personas,
    memberships,
    tables: {
      tenants,
      user_access: access,
      subscriptions,
      impersonation: [],
    },
    events,
  };
}
