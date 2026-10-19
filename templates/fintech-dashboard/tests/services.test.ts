import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { FintechDatabase } from '../src/database/schema.ts';
import { createFintechServices, InsufficientFundsError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<FintechDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<FintechDatabase>(definition);
};

const input = {
  fromAccountId: 'account-checking',
  toAccountId: 'account-savings',
  amountCents: 75_500,
  memo: 'Move to savings',
};

describe('fintech transfer service', () => {
  it('persists paired ledger rows and balances using the simulated clock', async () => {
    fresh();
    let runtime = await harness.boot('active');
    const services = createFintechServices(runtime);
    const beforeFrom = (await runtime.db.accounts.get(input.fromAccountId))!;
    const beforeTo = (await runtime.db.accounts.get(input.toAccountId))!;
    const rows = await services.transfers.create(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      accountId: beforeFrom.id,
      direction: 'out',
      amountCents: input.amountCents,
    });
    expect(rows[1]).toMatchObject({
      accountId: beforeTo.id,
      direction: 'in',
      amountCents: input.amountCents,
    });
    expect(rows[0]?.occurredAt).toBe(runtime.clock.now().toISOString());
    expect((await runtime.db.accounts.get(beforeFrom.id))?.balanceCents).toBe(
      beforeFrom.balanceCents - input.amountCents
    );
    expect((await runtime.db.accounts.get(beforeTo.id))?.balanceCents).toBe(
      beforeTo.balanceCents + input.amountCents
    );

    runtime = await harness.reload(runtime);
    expect(await runtime.db.transactions.where('category').equals('Transfer').count()).toBe(2);
    expect((await runtime.db.accounts.get(beforeFrom.id))?.balanceCents).toBe(
      beforeFrom.balanceCents - input.amountCents
    );
  });

  it('rejects insufficient funds without changing either account or the ledger', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const services = createFintechServices(runtime);
    const before = await runtime.db.accounts.toArray();
    const tooLarge = {
      ...input,
      amountCents: before.find((row) => row.id === input.fromAccountId)!.balanceCents + 1,
    };
    await expect(services.transfers.create(tooLarge)).rejects.toBeInstanceOf(
      InsufficientFundsError
    );
    expect(await runtime.db.accounts.toArray()).toEqual(before);
    expect(await runtime.db.transactions.where('category').equals('Transfer').count()).toBe(0);
  });

  it('blocks viewer transfers and surfaces offline failures without writes', async () => {
    fresh();
    const viewer = await harness.boot('viewer');
    await expect(createFintechServices(viewer).transfers.create(input)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await viewer.db.transactions.where('category').equals('Transfer').count()).toBe(0);

    fresh();
    const offline = await harness.boot('network-offline');
    const before = await offline.db.accounts.toArray();
    await expect(createFintechServices(offline).transfers.create(input)).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await offline.db.accounts.toArray()).toEqual(before);
    expect(await offline.db.transactions.where('category').equals('Transfer').count()).toBe(0);
  });

  it('validates distinct accounts and positive integer cents', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const services = createFintechServices(runtime);
    await expect(
      services.transfers.create({ ...input, toAccountId: input.fromAccountId })
    ).rejects.toMatchObject({
      issues: { toAccountId: expect.any(String) },
    });
    await expect(services.transfers.create({ ...input, amountCents: 0 })).rejects.toMatchObject({
      issues: { amountCents: expect.any(String) },
    });
  });
});
