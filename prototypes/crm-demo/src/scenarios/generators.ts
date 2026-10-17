import {
  type DomainEvent,
  type EventApplyContext,
  eventId,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type Row,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import {
  type Activity,
  type Company,
  type Contact,
  type Deal,
  type DealStage,
  INDUSTRIES,
  OPEN_STAGES,
  STAGE_PROBABILITY,
} from '../database/schema.ts';
import type { CrmGeneratorOptions } from './index.ts';

/**
 * Deterministic CRM world generator. Order matters for determinism and
 * referential integrity: organization → people/memberships → companies →
 * contacts → deals → activities. All randomness comes from `ctx.rng` /
 * `ctx.faker` (seeded) and all time from `ctx.time` (fixed reference).
 */

/** Bump when generated output for the same seed changes. */
export const CRM_GENERATOR_VERSION = 3;

/** Named core cast, so every scenario shares recognizable people. */
const CAST = [
  { id: 'user_0001', name: 'Alex Rivera', title: 'Founder & CEO', role: 'owner', color: '#7c3aed' },
  {
    id: 'user_0002',
    name: 'Morgan Lee',
    title: 'Head of Operations',
    role: 'admin',
    color: '#0891b2',
  },
  {
    id: 'user_0003',
    name: 'Priya Shah',
    title: 'Account Executive',
    role: 'rep',
    color: '#db2777',
  },
  {
    id: 'user_0004',
    name: 'Daniel Okafor',
    title: 'Finance Partner',
    role: 'viewer',
    color: '#65a30d',
  },
] as const;

const AVATAR_COLORS = ['#ea580c', '#2563eb', '#16a34a', '#9333ea', '#e11d48', '#0d9488', '#ca8a04'];

const ACTIVITY_MULTIPLIER = {
  none: 0,
  low: 0.5,
  normal: 1,
  intense: 2,
  dormant: 0.6,
  reactivated: 1,
} as const;

function emailFor(name: string, domain: string): string {
  return `${name
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')}@${domain}`;
}

function options(ctx: GenerateContext): Required<CrmGeneratorOptions> {
  const raw = (ctx.scenario.generators.crm ?? {}) as Partial<CrmGeneratorOptions>;
  return {
    companies: raw.companies ?? ctx.scale(16),
    dealsPerCompany: raw.dealsPerCompany ?? [1, 3],
    winRate: raw.winRate ?? 0.5,
    contactsPerCompany: raw.contactsPerCompany ?? [1, 3],
  };
}

export function generateCrmWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, faker, ids, time } = ctx;
  const iso = (d: Date) => d.toISOString();
  const now = time.now;
  const orgAge = scenario.organization.ageDays;
  const orgCreated = time.daysAgo(orgAge);
  /** Random instant in [from, to], never before org creation or after now. */
  const between = (from: Date, to: Date) => {
    const lo = Math.max(from.getTime(), orgCreated.getTime());
    const hi = Math.min(to.getTime(), now.getTime());
    return new Date(hi <= lo ? hi : lo + rng.next() * (hi - lo));
  };

  // ── Organization ────────────────────────────────────────────────────────
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Labs',
    type: 'company',
    plan: scenario.organization.subscription,
    billingStatus: scenario.organization.subscription === 'expired' ? 'expired' : 'active',
    createdAt: iso(orgCreated),
    size: scenario.organization.size,
    featureFlags: { forecasting: true, ...scenario.organization.featureFlags },
  };

  // ── People & memberships ───────────────────────────────────────────────
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  const addPerson = (p: {
    id: string;
    name: string;
    title: string;
    role: string;
    color: string;
    joinedAt: Date;
  }) => {
    const isActor = p.id === scenario.actor.id;
    const joinedAt = isActor
      ? time.daysAgo(Math.min(scenario.actor.joinedDaysAgo, orgAge))
      : p.joinedAt;
    const role = isActor ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: emailFor(p.name, 'northwind.example'),
      avatarColor: p.color,
      title: p.title,
      locale: 'en-US',
      timezone: 'America/Bogota',
      joinedAt: iso(joinedAt),
      onboardingComplete: isActor ? scenario.actor.onboardingComplete : true,
      preferences: {},
      summary: `${p.title} · joined ${Math.round((now.getTime() - joinedAt.getTime()) / MS_PER_DAY)}d ago`,
    });
    memberships.push({
      id: `member_${p.id}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt: iso(joinedAt),
      capabilities: [],
    });
  };

  const size = Math.max(1, scenario.organization.size);
  CAST.forEach((member, index) => {
    // A one-person workspace only has the founder (unless the actor is someone else).
    if (index >= size && member.id !== scenario.actor.id) return;
    const joinedAt =
      index === 0 ? orgCreated : between(orgCreated, time.daysAgo(Math.min(orgAge, 7)));
    addPerson({ ...member, joinedAt });
  });
  for (let i = CAST.length; i < size; i++) {
    const name = faker.person.fullName();
    addPerson({
      id: ids.next('teammate'),
      name,
      title: rng.pick(['Account Executive', 'SDR', 'Customer Success', 'Sales Engineer']),
      role: rng.weighted([
        ['rep', 6],
        ['viewer', 1],
      ]),
      color: rng.pick(AVATAR_COLORS),
      joinedAt: between(orgCreated, now),
    });
  }
  // Only people who can sell own deals.
  const sellers = memberships.filter((m) => m.role !== 'viewer').map((m) => m.personaId);
  const joinedOf = new Map(personas.map((p) => [p.id, new Date(p.joinedAt)]));

  // ── Companies, contacts, deals, activities ───────────────────────────────
  const opts = options(ctx);
  const companies: Company[] = [];
  const contacts: Contact[] = [];
  const deals: Deal[] = [];
  const activities: Activity[] = [];
  const level = scenario.activity.level;
  const activityRate = ACTIVITY_MULTIPLIER[level];
  // Dormant accounts: nothing happened in the last 45 days.
  const activityCeiling = level === 'dormant' ? time.daysAgo(Math.min(45, orgAge)) : now;

  const activity = (a: Omit<Activity, 'id'>) => activities.push({ id: ids.next('activity'), ...a });

  for (let c = 0; c < opts.companies; c++) {
    const name = faker.company.name().replace(/,/g, '');
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const ownerId = rng.pick(sellers);
    const createdAt = between(joinedOf.get(ownerId) ?? orgCreated, activityCeiling);
    const company: Company = {
      id: ids.next('company'),
      name,
      industry: rng.pick(INDUSTRIES),
      employees: rng.pick([12, 25, 40, 80, 150, 320, 800, 2400]),
      domain: `${slug.slice(0, 24)}.example`,
      city: faker.location.city(),
      ownerId,
      tags: rng.sample(
        ['enterprise', 'smb', 'partner', 'inbound', 'outbound', 'renewal'],
        rng.int(0, 2)
      ),
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt),
    };
    companies.push(company);
    activity({
      type: 'created',
      dealId: null,
      companyId: company.id,
      contactId: null,
      actorId: ownerId,
      body: `Created company ${company.name}`,
      at: company.createdAt,
    });

    const companyContacts: Contact[] = [];
    for (let k = 0, n = rng.int(...opts.contactsPerCompany); k < n; k++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const contactCreated = between(createdAt, activityCeiling);
      const contact: Contact = {
        id: ids.next('contact'),
        companyId: company.id,
        firstName,
        lastName,
        email: emailFor(`${firstName} ${lastName}`, company.domain),
        phone: `+1 555 01${String(rng.int(0, 99)).padStart(2, '0')}`,
        title: faker.person.jobTitle(),
        ownerId,
        createdAt: iso(contactCreated),
        updatedAt: iso(contactCreated),
      };
      contacts.push(contact);
      companyContacts.push(contact);
    }

    const [minDeals, maxDeals] = opts.dealsPerCompany;
    for (let d = 0, n = rng.int(minDeals, maxDeals); d < n; d++) {
      const dealOwner = rng.chance(0.75) ? ownerId : rng.pick(sellers);
      const dealCreated = between(createdAt, activityCeiling);
      const ageDays = (now.getTime() - dealCreated.getTime()) / MS_PER_DAY;
      // Older deals are more likely to be closed.
      const closed = ageDays > 10 && rng.chance(Math.min(0.85, ageDays / 45));
      const stage: DealStage = closed
        ? rng.chance(opts.winRate)
          ? 'won'
          : 'lost'
        : rng.weighted<DealStage>([
            ['lead', 4],
            ['qualified', 3],
            ['proposal', 2],
            ['negotiation', 1],
          ]);
      const closeDate = closed
        ? between(dealCreated, now)
        : new Date(now.getTime() + rng.int(5, 90) * MS_PER_DAY);
      const contact = companyContacts.length > 0 ? rng.pick(companyContacts) : null;
      const deal: Deal = {
        id: ids.next('deal'),
        title: `${company.name.split(' ')[0]} — ${rng.pick(['Platform', 'Expansion', 'Pilot', 'Renewal', 'Annual plan', 'Team seats', 'Integration'])}`,
        companyId: company.id,
        contactId: contact?.id ?? null,
        ownerId: dealOwner,
        stage,
        amount: rng.int(4, 240) * 500,
        currency: 'USD',
        probability: STAGE_PROBABILITY[stage],
        closeDate: iso(closeDate),
        lostReason:
          stage === 'lost'
            ? rng.pick(['Budget', 'Chose a competitor', 'No decision', 'Timing'])
            : null,
        createdAt: iso(dealCreated),
        closedAt: closed ? iso(closeDate) : null,
        updatedAt: iso(closed ? closeDate : dealCreated),
      };
      deals.push(deal);
      activity({
        type: 'created',
        dealId: deal.id,
        companyId: company.id,
        contactId: null,
        actorId: dealOwner,
        body: `Opened deal “${deal.title}”`,
        at: deal.createdAt,
      });
      if (stage !== 'lead') {
        activity({
          type: 'stage-change',
          dealId: deal.id,
          companyId: company.id,
          contactId: null,
          actorId: dealOwner,
          body: `Moved to ${stage[0]?.toUpperCase()}${stage.slice(1)}`,
          at:
            deal.updatedAt > deal.createdAt
              ? deal.updatedAt
              : iso(between(dealCreated, activityCeiling)),
        });
      }
      const touches = Math.round(rng.int(0, 4) * activityRate);
      for (let t = 0; t < touches; t++) {
        const type = rng.pick(['note', 'call', 'email', 'meeting'] as const);
        activity({
          type,
          dealId: deal.id,
          companyId: company.id,
          contactId: contact?.id ?? null,
          actorId: dealOwner,
          body: activityBody(type, contact, rng.next()),
          at: iso(between(dealCreated, activityCeiling)),
        });
      }
    }
  }

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      companies: companies as unknown as Row[],
      contacts: contacts as unknown as Row[],
      deals: deals as unknown as Row[],
      activities: activities as unknown as Row[],
    },
  };
}

function activityBody(type: Activity['type'], contact: Contact | null, roll: number): string {
  const who = contact ? `${contact.firstName} ${contact.lastName}` : 'the buyer';
  const options: Record<string, string[]> = {
    note: [
      `${who} wants a security review before procurement.`,
      'Budget confirmed for this quarter; legal review pending.',
      'Champion is strong, but the CFO has not been looped in yet.',
    ],
    call: [
      `Discovery call with ${who} — 3 teams interested.`,
      `Follow-up call with ${who}: pricing questions on annual billing.`,
    ],
    email: [`Sent proposal and case study to ${who}.`, `Shared onboarding plan with ${who}.`],
    meeting: [`Demo with ${who} and two engineers.`, `Quarterly review with ${who}.`],
  };
  const list = options[type] ?? ['Updated the deal.'];
  return list[Math.floor(roll * list.length)] ?? list[0] ?? '';
}

// ── Time advance ─────────────────────────────────────────────────────────

interface FollowUpPayload {
  dealId: string;
  actorId: string;
  /** Whether this follow-up moves an open deal one stage forward. */
  advance: boolean;
  /** Outcome used if the deal is in its last open stage. */
  closeAs: 'won' | 'lost';
  body: string;
}

/**
 * One deterministic day of pipeline life per simulated day. Events depend
 * ONLY on the day and the stable, sorted deal ids — never on current stages —
 * so advancing 7×1 day or 1×7 days produces identical events (idempotent),
 * and the stage transition is resolved when the event is applied.
 */
export async function crmTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const deals = ((await ctx.read('deals')) as unknown as Deal[])
    .map((d) => ({ id: d.id, ownerId: d.ownerId }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (deals.length === 0) return [];
  const events: DomainEvent[] = [];
  const startDay = Math.floor(ctx.from.getTime() / MS_PER_DAY);
  const endDay = Math.floor(ctx.to.getTime() / MS_PER_DAY);
  for (let day = startDay; day <= endDay; day++) {
    const at = new Date(day * MS_PER_DAY + 15 * 3_600_000);
    // The window is (from, to]: never emit before it or past the new "now".
    if (at.getTime() <= ctx.from.getTime() || at.getTime() > ctx.to.getTime()) continue;
    const rng = ctx.rng.fork(`crm-day-${day}`);
    const perDay = rng.int(1, 3);
    for (let n = 0; n < perDay; n++) {
      const deal = rng.pick(deals);
      events.push({
        id: eventId(ctx.scenario.id, at, n),
        type: 'crm.follow-up',
        at: at.toISOString(),
        actorId: deal.ownerId,
        source: 'timeline',
        payload: {
          dealId: deal.id,
          actorId: deal.ownerId,
          advance: rng.chance(0.3),
          closeAs: rng.chance(0.6) ? 'won' : 'lost',
          body: rng.pick([
            'Checked in after the demo; next steps agreed.',
            'Sent revised pricing.',
            'Procurement asked for the security questionnaire.',
            'Champion confirmed timeline.',
          ]),
        } satisfies FollowUpPayload,
      });
    }
  }
  return events;
}

export async function applyCrmEvent(event: DomainEvent, ctx: EventApplyContext): Promise<void> {
  if (event.type !== 'crm.follow-up') return;
  const payload = event.payload as FollowUpPayload;
  const deal = (await ctx.get('deals', payload.dealId)) as unknown as Deal | undefined;
  // Deleted or already closed deals get no follow-ups — never resurrect data.
  if (!deal || !OPEN_STAGES.includes(deal.stage)) return;
  await ctx.put('activities', {
    id: `activity_${event.id}`,
    type: 'note',
    dealId: deal.id,
    companyId: deal.companyId,
    contactId: deal.contactId,
    actorId: payload.actorId,
    body: payload.body,
    at: event.at,
  });
  if (!payload.advance) return;
  const next = OPEN_STAGES[OPEN_STAGES.indexOf(deal.stage) + 1] ?? payload.closeAs;
  await ctx.put('deals', {
    ...(deal as unknown as Row),
    stage: next,
    probability: STAGE_PROBABILITY[next],
    lostReason: next === 'lost' ? 'No decision' : null,
    closedAt: next === 'won' || next === 'lost' ? event.at : null,
    updatedAt: event.at,
  });
  await ctx.put('activities', {
    id: `activity_${event.id}_stage`,
    type: 'stage-change',
    dealId: deal.id,
    companyId: deal.companyId,
    contactId: null,
    actorId: payload.actorId,
    body: `Moved to ${next[0]?.toUpperCase()}${next.slice(1)}`,
    at: event.at,
  });
}
