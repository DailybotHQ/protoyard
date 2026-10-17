import { describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import type { Account, Beneficiary, Transaction } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { generateBankWorld } from '../src/scenarios/generators.ts';

const ctx = (id: string, seed?: number) => contextFor(definition.scenarios, id, seed);
const rows = <T>(world: ReturnType<typeof generateBankWorld>, table: string) =>
  (world.tables[table] ?? []) as unknown as T[];

describe('mobile-banking-demo generator', () => {
  it('is deterministic per seed', () => {
    expect(generateBankWorld(ctx('active-customer'))).toEqual(
      generateBankWorld(ctx('active-customer'))
    );
    expect(generateBankWorld(ctx('active-customer', 99)).tables.transactions).not.toEqual(
      generateBankWorld(ctx('active-customer')).tables.transactions
    );
  });

  it('keeps balance == sum(posted transactions) for every account in every scenario', () => {
    for (const scenario of definition.scenarios) {
      const world = generateBankWorld(ctx(scenario.id));
      const txns = rows<Transaction>(world, 'transactions');
      for (const account of rows<Account>(world, 'accounts')) {
        const sum = txns
          .filter((t) => t.accountId === account.id && t.status === 'posted')
          .reduce((s, t) => s + t.amountCents, 0);
        expect(account.balanceCents, `${scenario.id}/${account.id}`).toBe(sum);
      }
      const accountIds = new Set(rows<Account>(world, 'accounts').map((a) => a.id));
      for (const t of txns) {
        expect(accountIds.has(t.accountId)).toBe(true);
        expect(Number.isInteger(t.amountCents)).toBe(true);
        expect(Date.parse(t.at)).toBeLessThanOrEqual(
          Date.parse(ctx(scenario.id).scenario.referenceTime)
        );
      }
      expect(world.personas.some((p) => p.id === world.memberships[0]?.personaId)).toBe(true);
    }
  });

  it('maps scenario axes to meaningful worlds', () => {
    const fresh = generateBankWorld(ctx('new-account'));
    expect(rows(fresh, 'transactions')).toHaveLength(0);
    expect(rows(fresh, 'beneficiaries')).toHaveLength(0);
    const low = generateBankWorld(ctx('low-balance'));
    const checking = rows<Account>(low, 'accounts').find((a) => a.id === 'acct_checking');
    expect(checking?.balanceCents).toBe(2_350);
    const locked = generateBankWorld(ctx('locked-account'));
    expect(rows<Account>(locked, 'accounts').every((a) => a.status === 'locked')).toBe(true);
    const dormant = generateBankWorld(ctx('dormant-account'));
    const latest = rows<Transaction>(dormant, 'transactions').at(-1)?.at ?? '';
    expect(Date.parse('2026-10-16T15:00:00Z') - Date.parse(latest)).toBeGreaterThan(
      100 * 86_400_000
    );
    expect(
      rows<Beneficiary>(generateBankWorld(ctx('active-customer')), 'beneficiaries')
    ).toHaveLength(3);
  });
});
