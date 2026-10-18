import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type SubscriptionStatus,
} from '@protoyard/core';

/**
 * Identity helpers so generators stay short. They encode the invariants every
 * world needs: the scenario actor always exists with the scenario role and
 * tenure, the organization is exactly `ageDays` old, nobody joined before the
 * organization existed, and all contact data is fictional.
 */

export const AVATAR_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#9333ea',
  '#4f46e5',
] as const;

/** Reserved example domains (RFC 2606) — never real people or companies. */
export const EXAMPLE_EMAIL_DOMAINS = ['example.com', 'example.org'] as const;

const DEFAULT_TITLES: Record<string, readonly string[]> = {
  owner: ['Founder', 'Managing Director', 'Head of Operations'],
  admin: ['Operations Lead', 'Team Lead', 'Workspace Admin'],
  member: ['Specialist', 'Coordinator', 'Associate', 'Analyst', 'Designer', 'Engineer'],
  viewer: ['Stakeholder', 'Advisor', 'Auditor'],
};

const PLAN_BY_SUBSCRIPTION: Record<
  SubscriptionStatus,
  Pick<Organization, 'plan' | 'billingStatus' | 'billingInterval'>
> = {
  free: { plan: 'free', billingStatus: 'none', billingInterval: null },
  trial: { plan: 'pro', billingStatus: 'trialing', billingInterval: 'month' },
  pro: { plan: 'pro', billingStatus: 'active', billingInterval: 'month' },
  enterprise: { plan: 'enterprise', billingStatus: 'active', billingInterval: 'year' },
  expired: { plan: 'pro', billingStatus: 'expired', billingInterval: 'month' },
};

/** Days left on a generated trial. */
export const TRIAL_DAYS_LEFT = 7;
/** How long ago a generated `expired` subscription lapsed. */
export const LAPSED_DAYS_AGO = 14;
/** Billing periods are fixed lengths from the organization's creation (no calendar math). */
const PERIOD_DAYS = { month: 30, year: 365 } as const;

/**
 * Simulated billing fields, derived only from the subscription, the team
 * size and `ctx.time` (no rng), so adding them shifts no other value.
 */
export function billingFields(
  subscription: SubscriptionStatus,
  size: number,
  createdMs: number,
  nowMs: number
): Pick<Organization, 'trialEndsAt' | 'seats' | 'billingInterval' | 'currentPeriodEnd'> {
  const { billingInterval } = PLAN_BY_SUBSCRIPTION[subscription];
  // Enterprise buys seats in blocks of 10; everyone else pays for who is there.
  const seats = subscription === 'enterprise' ? Math.max(10, Math.ceil(size / 10) * 10) : size;
  const iso = (ms: number) => new Date(ms).toISOString();
  if (subscription === 'trial') {
    const end = iso(nowMs + TRIAL_DAYS_LEFT * MS_PER_DAY);
    return { trialEndsAt: end, seats, billingInterval, currentPeriodEnd: end };
  }
  if (subscription === 'expired') {
    return {
      trialEndsAt: null,
      seats,
      billingInterval,
      currentPeriodEnd: iso(nowMs - LAPSED_DAYS_AGO * MS_PER_DAY),
    };
  }
  if (!billingInterval) {
    return { trialEndsAt: null, seats, billingInterval: null, currentPeriodEnd: null };
  }
  const periodMs = PERIOD_DAYS[billingInterval] * MS_PER_DAY;
  const periods = Math.floor(Math.max(0, nowMs - createdMs) / periodMs) + 1;
  return {
    trialEndsAt: null,
    seats,
    billingInterval,
    currentPeriodEnd: iso(createdMs + periods * periodMs),
  };
}

export interface GenerateTeamOptions {
  /** Field overrides for the organization (name, type…). */
  organization?: Partial<Organization>;
  /** Field overrides for the actor persona (name, title…). */
  actor?: Partial<Omit<Persona, 'id' | 'joinedAt'>>;
  /** Total people including the actor. Defaults to `scenario.organization.size`. */
  size?: number;
  /**
   * Roles for the other members, as weights (`{ member: 6, viewer: 1 }`) or a
   * list cycled in order. Defaults to mostly members with one admin.
   */
  roles?: Readonly<Record<string, number>> | readonly string[];
  /** Job titles per role; falls back to neutral defaults. */
  titles?: Readonly<Record<string, readonly string[]>>;
  /** Email domain for the team. Must be an example domain. */
  emailDomain?: (typeof EXAMPLE_EMAIL_DOMAINS)[number];
}

export interface Team {
  organizations: Organization[];
  personas: Persona[];
  memberships: Membership[];
  organization: Organization;
  actor: Persona;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / MS_PER_DAY));
}

function emailLocalPart(first: string, last: string): string {
  const clean = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toLowerCase();
  return `${clean(first) || 'user'}.${clean(last) || 'example'}`;
}

function tenureSummary(title: string, days: number): string {
  if (days === 0) return `${title}, joined today`;
  if (days === 1) return `${title}, joined yesterday`;
  return `${title}, joined ${days} days ago`;
}

/**
 * Builds one organization and its people. Deterministic for the same
 * context. Role and avatar picks use a forked rng, but names come from the
 * shared `ctx.faker` and ids from `ctx.ids`: changing the team size DOES shift
 * later faker values and `user_*` ids, so generate the team first.
 */
export function generateTeam(ctx: GenerateContext, options: GenerateTeamOptions = {}): Team {
  const { scenario, faker, time } = ctx;
  const rng = ctx.rng.fork('protoyard:team');
  const nowMs = time.now.getTime();
  const orgCreatedMs = nowMs - scenario.organization.ageDays * MS_PER_DAY;
  const size = Math.max(1, options.size ?? scenario.organization.size);
  const domain = options.emailDomain ?? EXAMPLE_EMAIL_DOMAINS[0];
  const titles = { ...DEFAULT_TITLES, ...options.titles };
  const billing = PLAN_BY_SUBSCRIPTION[scenario.organization.subscription];

  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? `${faker.company.name()}`,
    type: scenario.organization.type ?? 'company',
    plan: billing.plan,
    billingStatus: billing.billingStatus,
    createdAt: new Date(orgCreatedMs).toISOString(),
    size,
    featureFlags: { ...scenario.organization.featureFlags },
    ...billingFields(scenario.organization.subscription, size, orgCreatedMs, nowMs),
    ...options.organization,
  };

  const roleFor = (() => {
    const roles = options.roles ?? { member: 6, admin: 1, viewer: 1 };
    if (Array.isArray(roles)) {
      const list = roles as readonly string[];
      return (index: number) => list[index % list.length] ?? 'member';
    }
    const entries = Object.entries(roles as Record<string, number>);
    return () => rng.weighted(entries);
  })();

  const usedEmails = new Set<string>();
  const uniqueEmail = (first: string, last: string) => {
    const local = emailLocalPart(first, last);
    let email = `${local}@${domain}`;
    for (let n = 2; usedEmails.has(email); n++) email = `${local}${n}@${domain}`;
    usedEmails.add(email);
    return email;
  };

  const makePersona = (
    id: string,
    role: string,
    joinedMs: number,
    overrides: Partial<Persona> = {}
  ): Persona => {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const title = overrides.title ?? rng.pick(titles[role] ?? titles.member ?? ['Member']);
    const name = overrides.name ?? `${first} ${last}`;
    const [nameFirst = first, ...rest] = name.split(' ');
    return {
      id,
      name,
      email: uniqueEmail(nameFirst, rest.join(' ') || last),
      avatarColor: rng.pick(AVATAR_COLORS),
      title,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt: new Date(joinedMs).toISOString(),
      onboardingComplete: true,
      preferences: {},
      summary: tenureSummary(title, daysBetween(joinedMs, nowMs)),
      ...overrides,
    };
  };

  // The actor never predates its organization, even if a scenario asks for it.
  const actorJoinedMs = Math.max(orgCreatedMs, nowMs - scenario.actor.joinedDaysAgo * MS_PER_DAY);
  const actor = makePersona(scenario.actor.id, scenario.actor.role, actorJoinedMs, {
    locale: scenario.actor.locale,
    onboardingComplete: scenario.actor.onboardingComplete,
    ...options.actor,
  });

  const personas: Persona[] = [actor];
  const memberships: Membership[] = [
    {
      id: `${organization.id}:${actor.id}`,
      personaId: actor.id,
      organizationId: organization.id,
      role: scenario.actor.role,
      joinedAt: actor.joinedAt,
      capabilities: [],
    },
  ];

  const usedIds = new Set([actor.id]);
  for (let index = 0; personas.length < size; index++) {
    let id = ctx.ids.next('user');
    while (usedIds.has(id)) id = ctx.ids.next('user');
    usedIds.add(id);
    const role = roleFor(index);
    const joinedMs = Math.floor(orgCreatedMs + rng.next() * (nowMs - orgCreatedMs));
    const persona = makePersona(id, role, joinedMs);
    personas.push(persona);
    memberships.push({
      id: `${organization.id}:${id}`,
      personaId: id,
      organizationId: organization.id,
      role,
      joinedAt: persona.joinedAt,
      capabilities: [],
    });
  }

  return { organizations: [organization], personas, memberships, organization, actor };
}
