import type { DomainEvent, EventApplyContext, Row } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { Account, BankDatabase } from '../src/database/schema.ts';
import { ledgerIsBalanced } from '../src/domain/services.ts';
import { applyBankEvent, type PostingPayload } from '../src/domain/timeline.ts';
import { definition } from '../src/prototype.ts';

let harnesses = [createHarness<BankDatabase>(definition), createHarness<BankDatabase>(definition)];
afterEach(() => {
  for (const h of harnesses) h.closeAll();
  harnesses = [createHarness<BankDatabase>(definition), createHarness<BankDatabase>(definition)];
});

const world = async (db: BankDatabase) => ({
  accounts: await db.accounts.orderBy('id').toArray(),
  transactions: await db.transactions.orderBy('id').toArray(),
});

describe('Lumen Bank timeline', () => {
  it('7 × 1 day equals 1 × 7 days, keeps the ledger balanced and replays apply nothing', async () => {
    const [h1, h2] = harnesses as [
      ReturnType<typeof createHarness<BankDatabase>>,
      ReturnType<typeof createHarness<BankDatabase>>,
    ];
    const a = await h1.boot('active-customer');
    const b = await h2.boot('active-customer');
    let appliedA = 0;
    for (let d = 0; d < 7; d++) appliedA += (await a.scenarios.advance({ days: 1 })).applied;
    const resultB = await b.scenarios.advance({ days: 7 });
    expect(appliedA).toBeGreaterThan(7);
    expect(resultB.applied).toBe(appliedA);
    expect(await world(a.db)).toEqual(await world(b.db));
    expect(await ledgerIsBalanced(a.db)).toBe(true);

    // Rewind the committed clock and replay the same window: every event id is known.
    b.clock.setState({ ...b.clock.getState(), committedOffsetMs: 0 });
    const before = await world(b.db);
    expect(await b.scenarios.advance({ days: 7 })).toEqual({
      applied: 0,
      skipped: resultB.applied,
    });
    expect(await world(b.db)).toEqual(before);
  });

  it('commits payroll, rent and auto-save on their days', async () => {
    const runtime = await harnesses[0]!.boot('active-customer');
    const checking = await runtime.db.accounts.get('acct_checking');
    // Reference is Oct 16; 20 days covers Nov 1 (payroll), Nov 3 (rent) and Nov 5 (auto-save).
    await runtime.scenarios.advance({ days: 20 });
    const events = await runtime.db.table('py_events').where('source').equals('timeline').toArray();
    const types = new Set(events.map((e) => (e as DomainEvent).type));
    expect([...types].sort()).toEqual([
      'bank.autosave',
      'bank.card-purchase',
      'bank.payroll',
      'bank.rent',
    ]);
    const payroll = await runtime.db.transactions.where('category').equals('salary').toArray();
    expect(payroll.some((t) => t.at.startsWith('2026-11-01'))).toBe(true);
    expect((await runtime.db.accounts.get('acct_checking'))?.balanceCents).not.toBe(
      checking?.balanceCents
    );
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
    expect(runtime.clock.committed().toISOString()).toBe('2026-11-05T15:00:00.000Z');
  });

  it('locked accounts never move and skips are recorded with a reason', async () => {
    const runtime = await harnesses[0]!.boot('locked-account');
    const before = await world(runtime.db);
    const result = await runtime.scenarios.advance({ days: 10 });
    expect(result.applied).toBeGreaterThan(0);
    expect(await world(runtime.db)).toEqual(before);
    const events = (await runtime.db
      .table('py_events')
      .where('source')
      .equals('timeline')
      .toArray()) as DomainEvent<PostingPayload>[];
    expect(events.length).toBe(result.applied);
    for (const event of events) {
      expect(event.payload.outcome).toMatchObject({
        status: 'skipped',
        reason: expect.stringMatching(/locked/),
      });
    }
  });

  it('never overdraws a deposit account, and multi-leg events are all-or-nothing', async () => {
    const rows = new Map<string, Row>();
    const account = (over: Partial<Account>): Account => ({
      id: 'acct_checking',
      ownerId: 'user_0001',
      name: 'Everyday Checking',
      type: 'checking',
      masked: '•••• 0000',
      balanceCents: 1_000,
      currency: 'USD',
      status: 'active',
      dailyLimitCents: 500_000,
      openedAt: '2026-01-01T00:00:00.000Z',
      ...over,
    });
    rows.set('accounts/acct_checking', account({}) as unknown as Row);
    rows.set(
      'accounts/acct_savings',
      account({ id: 'acct_savings', type: 'savings', balanceCents: 0 }) as unknown as Row
    );
    const ctx: EventApplyContext = {
      put: async (table, row) => void rows.set(`${table}/${row.id}`, row),
      get: async (table, id) => rows.get(`${table}/${id}`),
      remove: async (table, id) => void rows.delete(`${table}/${id}`),
    };
    const event = (payload: PostingPayload): DomainEvent => ({
      id: 'evt:test:2026-11-03:0',
      type: 'bank.autosave',
      at: '2026-11-03T08:00:00.000Z',
      source: 'timeline',
      payload,
    });

    const autosave: PostingPayload = {
      category: 'transfer',
      postings: [
        {
          accountId: 'acct_checking',
          amountCents: -40_000,
          description: 'Auto-save',
          merchant: 'Savings',
        },
        {
          accountId: 'acct_savings',
          amountCents: 40_000,
          description: 'Auto-save',
          merchant: 'Checking',
        },
      ],
    };
    await applyBankEvent(event(autosave), ctx);
    expect(autosave.outcome).toEqual({
      status: 'skipped',
      reason: 'Everyday Checking has insufficient funds',
    });
    expect([...rows.keys()].filter((k) => k.startsWith('transactions/'))).toEqual([]);
    expect((rows.get('accounts/acct_savings') as unknown as Account).balanceCents).toBe(0);

    const small: PostingPayload = {
      ...autosave,
      postings: autosave.postings.map((p) => ({
        ...p,
        amountCents: Math.sign(p.amountCents) * 500,
      })),
    };
    await applyBankEvent(event(small), ctx);
    expect(small.outcome).toEqual({ status: 'applied' });
    expect((rows.get('accounts/acct_checking') as unknown as Account).balanceCents).toBe(500);
    expect((rows.get('accounts/acct_savings') as unknown as Account).balanceCents).toBe(500);
  });

  it('keeps every deposit account non-negative over a month of low balance', async () => {
    const runtime = await harnesses[0]!.boot('low-balance');
    await runtime.scenarios.advance({ days: 30 });
    for (const account of await runtime.db.accounts.toArray()) {
      if (account.type !== 'credit') expect(account.balanceCents).toBeGreaterThanOrEqual(0);
    }
    expect(await ledgerIsBalanced(runtime.db)).toBe(true);
  });
});
