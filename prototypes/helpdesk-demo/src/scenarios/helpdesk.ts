import type { GenerateContext, Row, WorldSeed } from '@protoyard/core';

/**
 * Turns the generic blueprint world into a believable support desk. The
 * blueprint generator fills fields mechanically (every ticket `open`, lorem
 * subjects); this pass rewrites tickets and replies with fictional support
 * copy, weighted statuses and priorities, and SLA deadlines derived from the
 * priority, then tops tickets up to a density-scaled count. Only `ctx.rng`,
 * `ctx.ids` and `ctx.time` are used, so the same seed builds the same desk.
 */

export const SLA_HOURS: Record<string, number> = { urgent: 4, high: 8, normal: 24, low: 72 };

const SUBJECTS = [
  'Cannot sign in after resetting my password',
  'Invoice shows the wrong billing address',
  'Export to CSV times out on large reports',
  'Two-factor codes arrive late',
  'Team member invite link expired',
  'Dashboard charts are empty since this morning',
  'Request to change the account owner',
  'Mobile app crashes when attaching photos',
  'Refund for a duplicate charge',
  'Webhook deliveries failing with 401',
  'How do I set up SSO for my team?',
  'Calendar sync stopped updating',
  'Feature request: dark mode for reports',
  'Data import skipped half of the rows',
  'Cannot remove a former employee',
  'Email notifications going to spam',
  'API rate limit reached unexpectedly',
  'Need a copy of last quarter’s invoices',
  'Search does not find archived projects',
  'Plan upgrade did not unlock seats',
  'Password reset email never arrives',
  'Custom domain shows a certificate warning',
  'Bulk edit changed the wrong records',
  'Need help migrating from a spreadsheet',
  'Slack integration posts duplicate messages',
  'Report totals do not match the invoice',
] as const;

const DESCRIPTIONS = [
  'The customer reports this started after the last update. Steps to reproduce are in the first reply.',
  'Happens for several users in the same workspace. No error message is shown.',
  'Customer attached a screenshot and asked for an update by end of day.',
  'Reported through the in-app widget; the customer is on the {plan} plan.',
] as const;

const REPLIES = [
  'Thanks for reaching out! I am looking into this now and will update you shortly.',
  'Could you share a screenshot of the error and the time it happened?',
  'I reproduced the issue and escalated it to our engineering team.',
  'A fix is rolling out today. Please let me know if it works for you.',
  'Following up: were you able to try the steps from my last message?',
] as const;

const INTERNAL_NOTES = [
  'Checked the logs: looks related to the sync job from yesterday.',
  'Customer is on an annual contract, handle with priority.',
  'Waiting on engineering, linked to the incident review.',
] as const;

const PRIORITIES = [
  ['low', 2],
  ['normal', 5],
  ['high', 2],
  ['urgent', 1],
] as const;
const STATUSES = [
  ['open', 4],
  ['pending', 2],
  ['on-hold', 1],
  ['solved', 3],
] as const;
const CHANNELS = [
  ['email', 5],
  ['chat', 3],
  ['phone', 1],
] as const;
const HOUR = 3_600_000;

export async function enrichHelpdeskWorld(
  world: WorldSeed,
  ctx: GenerateContext
): Promise<WorldSeed> {
  const rng = ctx.rng.fork('helpdesk:enrich');
  const now = ctx.time.now.getTime();
  const orgCreated = Date.parse(world.organizations[0]?.createdAt ?? ctx.time.now.toISOString());
  const customers = (world.tables.customers ?? []) as Row[];
  const agents = world.personas.filter((p) =>
    world.memberships.some((m) => m.personaId === p.id && m.role !== 'viewer')
  );
  const base = (world.tables.tickets ?? []) as Row[];
  if (customers.length === 0 || base.length === 0 || agents.length === 0) return world;

  // Solved tickets span the last ten days; unsolved ones mostly sit inside their SLA
  // window (about one in four past it). Never before the workspace existed.
  const createdAt = (status: string, priority: string) => {
    const earliest = orgCreated + HOUR;
    const sla = (SLA_HOURS[priority] as number) * HOUR;
    const age = status === 'solved' ? HOUR + rng.next() * 10 * 24 * HOUR : rng.next() * sla * 1.3;
    return Math.max(earliest, Math.floor(now - age));
  };

  const shape = base[0] as Row;
  const target = Math.max(base.length, ctx.scale(24));
  const extra = Array.from({ length: target - base.length }, () => ({
    ...shape,
    id: ctx.ids.next('ticket'),
  }));

  const all: Row[] = [...base, ...extra];
  const tickets = all.map((ticket, i): Row => {
    const priority = rng.weighted(PRIORITIES);
    const status = rng.weighted(STATUSES);
    const created = createdAt(status, priority);
    const customer = rng.pick(customers);
    const updated = created + Math.floor(rng.next() * (now - created));
    return {
      ...ticket,
      subject: SUBJECTS[i % SUBJECTS.length] as string,
      description: (rng.pick(DESCRIPTIONS) as string).replace(
        '{plan}',
        String(customer.plan ?? 'free')
      ),
      status,
      priority,
      channel: rng.weighted(CHANNELS),
      customerId: i < base.length ? ticket.customerId : customer.id,
      assigneeId: rng.chance(0.85) ? rng.pick(agents).id : null,
      slaDueAt: new Date(created + (SLA_HOURS[priority] as number) * HOUR).toISOString(),
      attachmentsIds: [],
      tags: rng.chance(0.4)
        ? [rng.pick(['billing', 'bug', 'onboarding', 'vip', 'api'] as const)]
        : [],
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(updated).toISOString(),
      deletedAt: null,
    };
  });

  const ticketTimes = new Map(tickets.map((t) => [t.id, Date.parse(String(t.createdAt))]));
  const baseReplies = (world.tables.replies ?? []) as Row[];
  const replyShape = (baseReplies[0] ?? { id: '' }) as Row;
  const replyTarget = Math.max(baseReplies.length, ctx.scale(36));
  const allReplies: Row[] = [
    ...baseReplies,
    ...Array.from({ length: replyTarget - baseReplies.length }, () => ({
      ...replyShape,
      id: ctx.ids.next('reply'),
    })),
  ];
  const replies = allReplies.map((reply, i): Row => {
    const ticket = tickets[i % tickets.length] as Row;
    const start = ticketTimes.get(ticket.id) ?? now - HOUR;
    const at = new Date(start + Math.floor(rng.next() * (now - start))).toISOString();
    const internal = rng.chance(0.25);
    return {
      ...reply,
      message: (internal ? rng.pick(INTERNAL_NOTES) : rng.pick(REPLIES)) as string,
      ticketId: ticket.id,
      internal,
      authorId: rng.pick(agents).id,
      createdAt: at,
      updatedAt: at,
    };
  });

  return { ...world, tables: { ...world.tables, tickets, replies } };
}
