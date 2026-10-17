import {
  createRng,
  type DomainEvent,
  type EventApplyContext,
  eventId,
  MS_PER_DAY,
  MS_PER_HOUR,
  type Rng,
  type Row,
  type TimelineContext,
} from '@protoyard/core';
import type { Account, Category, Transaction } from '../database/schema.ts';
import { MERCHANTS } from '../scenarios/generators.ts';

/**
 * Lumen Bank time travel. Advancing the clock commits what a real household
 * account would see: payroll on the 1st and 15th, rent on the 3rd, an auto-save
 * on the 5th and 1–3 card purchases a day.
 *
 * Two rules keep it idempotent and honest:
 *  1. EVENTS depend only on the day and stable account ids — never on balances
 *     or the requested window — so 7×1 day and 1×7 days emit identical events
 *     with identical ids, and the runtime skips ids it already applied.
 *  2. APPLYING decides what actually happens given the current state: locked or
 *     dormant accounts don't move, and a debit never overdraws a deposit
 *     account. Skips are recorded on the stored event (`payload.outcome`).
 */

export const PAYROLL_CENTS = 285_000;
export const RENT_CENTS = 180_000;
export const AUTOSAVE_CENTS = 40_000;
const CHECKING = 'acct_checking';
const SAVINGS = 'acct_savings';
const CARD = 'acct_credit';

export type Outcome = { status: 'applied' } | { status: 'skipped'; reason: string };

export interface PostingPayload {
  /** Signed cents per account; one row is written per entry. */
  postings: { accountId: string; amountCents: number; description: string; merchant: string }[];
  category: Category;
  /** Filled in by `applyBankEvent`. */
  outcome?: Outcome;
}

type BankEvent = DomainEvent<PostingPayload>;

const SPEND_CATEGORIES = [
  ['groceries', 4],
  ['dining', 3],
  ['transport', 3],
  ['shopping', 2],
  ['entertainment', 1],
  ['health', 1],
] as const;

function eventsForDay(ctx: Pick<TimelineContext, 'scenario'>, dayMs: number): BankEvent[] {
  const day = new Date(dayMs);
  const dom = day.getUTCDate();
  // Seeded by scenario + day only, so a day's events never depend on the window.
  const rng: Rng = createRng(
    `lumen:timeline:${ctx.scenario.id}:${ctx.scenario.seed}:${day.toISOString().slice(0, 10)}`
  );
  const at = (hour: number, minute = 0) =>
    new Date(dayMs + hour * MS_PER_HOUR + minute * 60_000).toISOString();
  const out: Omit<BankEvent, 'id'>[] = [];
  const posting = (
    type: string,
    when: string,
    category: Category,
    postings: PostingPayload['postings']
  ) => out.push({ type, at: when, source: 'timeline', payload: { category, postings } });

  if (dom === 1 || dom === 15) {
    posting('bank.payroll', at(9), 'salary', [
      {
        accountId: CHECKING,
        amountCents: PAYROLL_CENTS,
        description: 'Payroll deposit',
        merchant: 'Brightpath Studio payroll',
      },
    ]);
  }
  if (dom === 3) {
    posting('bank.rent', at(8), 'rent', [
      {
        accountId: CHECKING,
        amountCents: -RENT_CENTS,
        description: 'Rent',
        merchant: 'Maple Court Apartments',
      },
    ]);
  }
  if (dom === 5) {
    posting('bank.autosave', at(10), 'transfer', [
      {
        accountId: CHECKING,
        amountCents: -AUTOSAVE_CENTS,
        description: 'Auto-save',
        merchant: 'Rainy-day Savings',
      },
      {
        accountId: SAVINGS,
        amountCents: AUTOSAVE_CENTS,
        description: 'Auto-save',
        merchant: 'Everyday Checking',
      },
    ]);
  }
  for (let n = 0, count = rng.int(1, 3); n < count; n++) {
    const category = rng.weighted(SPEND_CATEGORIES);
    const merchant = rng.pick(MERCHANTS[category]);
    const cents = rng.int(4, category === 'shopping' ? 180 : 70) * 100 + rng.int(0, 99);
    const accountId = rng.chance(0.45) ? CARD : CHECKING;
    posting('bank.card-purchase', at(rng.int(8, 21), rng.int(0, 59)), category, [
      { accountId, amountCents: -cents, description: merchant, merchant },
    ]);
  }

  return out
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((event, index) => ({ ...event, id: eventId(ctx.scenario.id, day, index) }));
}

/** Events in `(from, to]`, derived day by day (window-independent). */
export function bankTimeline(ctx: TimelineContext): BankEvent[] {
  const fromMs = ctx.from.getTime();
  const toMs = ctx.to.getTime();
  const events: BankEvent[] = [];
  for (
    let dayMs = Math.floor(fromMs / MS_PER_DAY) * MS_PER_DAY;
    dayMs <= toMs;
    dayMs += MS_PER_DAY
  ) {
    for (const event of eventsForDay(ctx, dayMs)) {
      const atMs = Date.parse(event.at);
      if (atMs > fromMs && atMs <= toMs) events.push(event);
    }
  }
  return events;
}

/** Why an account can't take this posting right now, or null when it can. */
function blocker(account: Account | undefined, amountCents: number, id: string): string | null {
  if (!account) return `account ${id} does not exist in this world`;
  if (account.status !== 'active') return `${account.name} is ${account.status}`;
  if (amountCents >= 0) return null;
  const floor = account.type === 'credit' ? -account.dailyLimitCents * 10 : 0;
  if (account.balanceCents + amountCents < floor) {
    return account.type === 'credit'
      ? `${account.name} would exceed its credit limit`
      : `${account.name} has insufficient funds`;
  }
  return null;
}

/**
 * Applies one event inside the runtime's transaction. All postings land or
 * none do (a multi-leg auto-save never half-moves money).
 */
export async function applyBankEvent(event: DomainEvent, ctx: EventApplyContext): Promise<void> {
  const payload = event.payload as PostingPayload;
  const accounts = new Map<string, Account>();
  for (const posting of payload.postings) {
    const account =
      accounts.get(posting.accountId) ??
      ((await ctx.get('accounts', posting.accountId)) as Account | undefined);
    const reason = blocker(account, posting.amountCents, posting.accountId);
    if (reason || !account) {
      payload.outcome = { status: 'skipped', reason: reason ?? 'unknown account' };
      return;
    }
    accounts.set(account.id, {
      ...account,
      balanceCents: account.balanceCents + posting.amountCents,
    });
  }
  for (const [index, posting] of payload.postings.entries()) {
    const row: Transaction = {
      id: `txn_${event.id.replace(/[^A-Za-z0-9]+/g, '_')}_${index}`,
      accountId: posting.accountId,
      amountCents: posting.amountCents,
      description: posting.description,
      merchant: posting.merchant,
      category: payload.category,
      status: 'posted',
      transferId: null,
      at: event.at,
    };
    await ctx.put('transactions', row as unknown as Row);
  }
  for (const account of accounts.values()) await ctx.put('accounts', account as unknown as Row);
  payload.outcome = { status: 'applied' };
}
