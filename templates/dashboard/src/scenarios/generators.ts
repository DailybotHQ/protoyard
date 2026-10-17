import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  MS_PER_HOUR,
  type Organization,
  type Persona,
  type WorldSeed,
} from '@protoyard/core';
import type {
  AppEvent,
  Customer,
  CustomerStatus,
  Order,
  OrderStatus,
  Plan,
  WorkspaceSettings,
} from '../database/schema.ts';
import { ORDER_STATUS_LABELS } from '../domain/services.ts';
import type { DashboardGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` (seeded) and every date from `ctx.time` (anchored at the
 * scenario reference time), so the same scenario renders the same world on
 * every machine. Order matters: people → customers → orders → events.
 */

/** Bump when the same seed would produce a different world. */
export const DASHBOARD_GENERATOR_VERSION = 1;

/** Fixed people, so links like `?actor=user_0004` always mean the same person. */
const PEOPLE = [
  { id: 'user_0001', name: 'Olivia Hart', title: 'Founder', role: 'owner', color: '#7c3aed' },
  {
    id: 'user_0002',
    name: 'Marcus Chen',
    title: 'Operations lead',
    role: 'admin',
    color: '#0891b2',
  },
  {
    id: 'user_0003',
    name: 'Priya Nair',
    title: 'Account manager',
    role: 'member',
    color: '#059669',
  },
  {
    id: 'user_0004',
    name: 'Victor Lane',
    title: 'Investor (read-only)',
    role: 'viewer',
    color: '#d97706',
  },
] as const;

const PRODUCTS: Record<Plan, readonly (readonly [string, number, number])[]> = {
  starter: [
    ['Monthly subscription', 29, 99],
    ['Extra seats (2)', 40, 80],
    ['Usage overage', 15, 120],
  ],
  growth: [
    ['Annual subscription', 900, 2400],
    ['Seat expansion (10 seats)', 300, 900],
    ['Priority support add-on', 200, 600],
    ['Onboarding package', 500, 1200],
  ],
  enterprise: [
    ['Enterprise license', 6000, 18000],
    ['Data migration', 2500, 7000],
    ['Training workshop', 1500, 4000],
    ['Dedicated support', 3000, 9000],
  ],
};

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'Spain',
  'Brazil',
  'Colombia',
  'India',
  'Japan',
  'Australia',
] as const;

function options(ctx: GenerateContext): DashboardGeneratorOptions {
  const raw = (ctx.scenario.generators.dashboard ?? {}) as Partial<DashboardGeneratorOptions>;
  return {
    customers: Math.max(0, Math.floor(raw.customers ?? ctx.scale(36))),
    ordersPerCustomer: raw.ordersPerCustomer ?? [1, 5],
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const orgCreated = time.daysAgo(ageDays);
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Acme Cloud',
    type: 'company',
    // Trials and lapsed subscriptions are on the Pro plan, with a matching billing status.
    plan: subscription === 'trial' || subscription === 'expired' ? 'pro' : subscription,
    billingStatus:
      subscription === 'expired' ? 'expired' : subscription === 'trial' ? 'trialing' : 'active',
    createdAt: time.iso(orgCreated),
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const joinedDays = (id: string, index: number) => {
    if (id === scenario.actor.id) return Math.min(ageDays, scenario.actor.joinedDaysAgo);
    // The founder joined on day one; everyone else joined in order afterwards.
    return index === 0 ? ageDays : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((p, index) => {
    const days = joinedDays(p.id, index);
    const joinedAt = time.iso(time.daysAgo(days));
    // The scenario decides the actor's role; the others keep their fixed role.
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title} · ${role}, joined ${days === 0 ? 'today' : `${days} days ago`}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships };
}

function customerStatus(ctx: GenerateContext, ageDays: number): CustomerStatus {
  if (ageDays < 14 && ctx.rng.chance(0.6)) return 'trial';
  return ctx.rng.weighted<CustomerStatus>([
    ['active', 7],
    ['trial', 1],
    ['paused', 1],
    ['churned', 1],
  ]);
}

function orderStatus(ctx: GenerateContext, ageHours: number): OrderStatus {
  if (ageHours < 24)
    return ctx.rng.weighted<OrderStatus>([
      ['pending', 3],
      ['paid', 2],
    ]);
  if (ageHours < 24 * 7) {
    return ctx.rng.weighted<OrderStatus>([
      ['pending', 1],
      ['paid', 3],
      ['fulfilled', 3],
      ['cancelled', 0.3],
    ]);
  }
  return ctx.rng.weighted<OrderStatus>([
    ['fulfilled', 14],
    ['paid', 1],
    ['refunded', 0.8],
    ['cancelled', 0.6],
  ]);
}

const PREVIOUS: Record<OrderStatus, OrderStatus> = {
  pending: 'pending',
  paid: 'pending',
  fulfilled: 'paid',
  refunded: 'fulfilled',
  cancelled: 'pending',
};

export function generateDashboardWorld(ctx: GenerateContext): WorldSeed {
  const { rng, faker, time, ids } = ctx;
  const { organization, personas, memberships } = identities(ctx);
  const opts = options(ctx);
  const nowMs = time.now.getTime();
  const orgCreatedMs = Date.parse(organization.createdAt);
  // Owners, admins and members create customers; viewers never author anything.
  const authors = memberships.filter((m) => m.role !== 'viewer');

  const customers: Customer[] = [];
  const draftOrders: Omit<Order, 'id' | 'reference'>[] = [];
  const createdAts = Array.from({ length: opts.customers }, () =>
    time.between(new Date(orgCreatedMs), time.now, rng.next).getTime()
  ).sort((a, b) => a - b);

  for (const createdMs of createdAts) {
    const plan = rng.weighted<Plan>([
      ['starter', 5],
      ['growth', 3],
      ['enterprise', 1],
    ]);
    const status = customerStatus(ctx, (nowMs - createdMs) / MS_PER_DAY);
    const eligible = authors.filter((m) => Date.parse(m.joinedAt) <= createdMs);
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const customer: Customer = {
      id: ids.next('customer'),
      name: `${first} ${last}`,
      email: faker.internet
        .email({ firstName: first, lastName: last, provider: 'example.com' })
        .toLowerCase(),
      company: faker.company.name(),
      plan,
      status,
      country: rng.pick(COUNTRIES),
      ownerId: (eligible.length ? rng.pick(eligible) : authors[0])?.personaId ?? 'user_0001',
      createdAt: time.iso(new Date(createdMs)),
      updatedAt: time.iso(new Date(Math.min(nowMs, createdMs + rng.int(0, 96) * MS_PER_HOUR))),
    };
    customers.push(customer);

    // Trials have not paid yet; everybody else has some order history.
    const count =
      status === 'trial' ? 0 : rng.int(opts.ordersPerCustomer[0], opts.ordersPerCustomer[1]);
    for (let i = 0; i < count; i++) {
      const [description, min, max] = rng.pick(PRODUCTS[plan]);
      const orderMs = time.between(new Date(createdMs), time.now, rng.next).getTime();
      const status = orderStatus(ctx, (nowMs - orderMs) / MS_PER_HOUR);
      const updatedMs =
        status === 'pending' ? orderMs : Math.min(nowMs, orderMs + rng.int(1, 72) * MS_PER_HOUR);
      draftOrders.push({
        customerId: customer.id,
        description,
        amount: rng.int(min, max),
        status,
        createdAt: time.iso(new Date(orderMs)),
        updatedAt: time.iso(new Date(updatedMs)),
      });
    }
  }

  // References follow creation time, like a real sequence.
  const orders: Order[] = draftOrders
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((draft, i) => ({ id: ids.next('order'), reference: `ORD-${1001 + i}`, ...draft }));

  const byId = new Map(customers.map((c) => [c.id, c]));
  const drafts: Omit<AppEvent, 'id'>[] = [];
  for (const c of customers) {
    drafts.push({
      type: 'customer.created',
      message: `Added customer ${c.name}`,
      customerId: c.id,
      orderId: null,
      actorId: c.ownerId,
      at: c.createdAt,
    });
  }
  for (const o of orders) {
    const customer = byId.get(o.customerId);
    const actorId = customer?.ownerId ?? 'user_0001';
    drafts.push({
      type: 'order.created',
      message: `Created ${o.reference} for ${customer?.name ?? 'a customer'}`,
      customerId: o.customerId,
      orderId: o.id,
      actorId,
      at: o.createdAt,
    });
    if (o.status !== 'pending') {
      drafts.push({
        type: 'order.status_changed',
        message: `${o.reference}: ${ORDER_STATUS_LABELS[PREVIOUS[o.status]]} → ${ORDER_STATUS_LABELS[o.status]}`,
        customerId: o.customerId,
        orderId: o.id,
        actorId,
        at: o.updatedAt,
      });
    }
  }
  const events: AppEvent[] = drafts
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((draft) => ({ id: ids.next('event'), ...draft }));

  const settings: WorkspaceSettings = {
    id: 'workspace',
    workspaceName: organization.name,
    supportEmail: 'support@example.com',
    currency: 'USD',
    weeklyReport: true,
    updatedAt: organization.createdAt,
    updatedBy: 'user_0001',
  };

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { customers, orders, events, settings: [settings] },
  };
}
