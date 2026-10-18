import type { Row } from '@protoyard/core';

/**
 * Pure help desk metrics for the dashboard (tested without a browser). SLA
 * math uses the simulated clock passed in as `now`, never the real one.
 */

export const STATUSES = ['open', 'pending', 'on-hold', 'solved'] as const;
export type TicketStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  'on-hold': 'On hold',
  solved: 'Solved',
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const HOUR = 3_600_000;

export type SlaState =
  | { kind: 'none' }
  | { kind: 'met' }
  | { kind: 'breached'; hours: number }
  | { kind: 'due'; hours: number };

/** SLA state of one ticket. Solved tickets no longer run their SLA clock. */
export function slaState(ticket: Row, now: Date): SlaState {
  if (ticket.status === 'solved') return { kind: 'met' };
  if (typeof ticket.slaDueAt !== 'string') return { kind: 'none' };
  const diff = new Date(ticket.slaDueAt).getTime() - now.getTime();
  if (Number.isNaN(diff)) return { kind: 'none' };
  return diff < 0
    ? { kind: 'breached', hours: Math.ceil(-diff / HOUR) }
    : { kind: 'due', hours: Math.floor(diff / HOUR) };
}

/** Human label for an SLA state: "Breached 3 h ago", "Due in 5 h", "Due in 2 d". */
export function slaLabel(state: SlaState): string {
  const span = (hours: number) => (hours >= 48 ? `${Math.floor(hours / 24)} d` : `${hours} h`);
  if (state.kind === 'breached') return `Breached ${span(state.hours)} ago`;
  if (state.kind === 'due')
    return state.hours < 1 ? 'Due within the hour' : `Due in ${span(state.hours)}`;
  if (state.kind === 'met') return 'Solved';
  return 'No SLA';
}

/** Urgent first, then the SLA that expires soonest, then subject: the order agents work in. */
export function byUrgency(a: Row, b: Row): number {
  const rank = (row: Row) => PRIORITY_RANK[String(row.priority)] ?? 9;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const due = (row: Row) =>
    typeof row.slaDueAt === 'string' ? new Date(row.slaDueAt).getTime() : Number.POSITIVE_INFINITY;
  if (due(a) !== due(b)) return due(a) - due(b);
  return String(a.subject).localeCompare(String(b.subject));
}

export interface HelpdeskMetrics {
  total: number;
  unsolved: number;
  breached: number;
  dueSoon: number;
  urgent: number;
  board: Record<TicketStatus, Row[]>;
  agentLoad: { personaId: string | null; open: number; breached: number }[];
}

/** Dashboard numbers from the visible (non-deleted) tickets. */
export function helpdeskMetrics(tickets: readonly Row[], now: Date): HelpdeskMetrics {
  const board = Object.fromEntries(STATUSES.map((s) => [s, [] as Row[]])) as Record<
    TicketStatus,
    Row[]
  >;
  const load = new Map<string | null, { open: number; breached: number }>();
  let breached = 0;
  let dueSoon = 0;
  let urgent = 0;
  for (const ticket of tickets) {
    const status = (STATUSES as readonly string[]).includes(String(ticket.status))
      ? (ticket.status as TicketStatus)
      : 'open';
    board[status].push(ticket);
    if (status === 'solved') continue;
    const sla = slaState(ticket, now);
    const isBreached = sla.kind === 'breached';
    if (isBreached) breached++;
    if (sla.kind === 'due' && sla.hours < 24) dueSoon++;
    if (ticket.priority === 'urgent') urgent++;
    const key = typeof ticket.assigneeId === 'string' ? ticket.assigneeId : null;
    const entry = load.get(key) ?? { open: 0, breached: 0 };
    entry.open++;
    if (isBreached) entry.breached++;
    load.set(key, entry);
  }
  for (const status of STATUSES) board[status].sort(byUrgency);
  return {
    total: tickets.length,
    unsolved: tickets.length - board.solved.length,
    breached,
    dueSoon,
    urgent,
    board,
    agentLoad: [...load]
      .map(([personaId, v]) => ({ personaId, ...v }))
      .sort((a, b) => b.open - a.open || String(a.personaId).localeCompare(String(b.personaId))),
  };
}

/** The status a board card moves to with "←" / "→", or null at the edges. */
export function neighborStatus(status: TicketStatus, direction: -1 | 1): TicketStatus | null {
  return STATUSES[STATUSES.indexOf(status) + direction] ?? null;
}
