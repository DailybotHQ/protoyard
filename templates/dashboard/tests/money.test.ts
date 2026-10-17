import type { DatabaseVersion } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { DashboardDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { OrderInputSchema, toCents } from '../src/domain/validation.ts';
import { money } from '../src/lib/format.ts';
import { definition } from '../src/prototype.ts';

describe('money is integer cents end to end', () => {
  it('parses typed amounts exactly, without float math', () => {
    expect(toCents('1200')).toBe(120_000);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('1,299.5')).toBe(129_950);
    expect(toCents(12.34)).toBe(1234);
    for (const bad of ['', 'abc', '1.234', '-5', '1e3']) expect(toCents(bad), bad).toBeNaN();
    expect(
      OrderInputSchema.safeParse({ customerId: 'c', description: 'Plan', amount: '1.005' }).success
    ).toBe(false);
    expect(money(129_950, 'USD')).toBe('$1,299.50');
    expect(money(120_000, 'USD')).toBe('$1,200');
    expect(money(30, 'USD')).toBe('$0.30');
  });

  it('stores new orders and seeded orders as integer cents', async () => {
    const harness = createHarness<DashboardDatabase>(definition);
    const runtime = await harness.boot();
    const services = createServices(runtime);
    const customer = (await runtime.db.customers.toArray())[0];
    if (!customer) throw new Error('seeded customer');
    const order = await services.orders.create({
      customerId: customer.id,
      description: 'Seats',
      amount: '0.30',
    });
    expect(order.amountCents).toBe(30);
    for (const row of await runtime.db.orders.toArray()) {
      expect(Number.isInteger(row.amountCents), row.id).toBe(true);
      expect('amount' in row).toBe(false);
    }
    harness.closeAll();
  });

  it('migrates v1 rows (float dollars) to v2 cents without losing data', async () => {
    const indexedDB = new IDBFactory();
    const v1: DatabaseVersion = { ...(definition.database.versions[0] as DatabaseVersion) };
    const oldDefinition = {
      ...definition,
      manifest: {
        ...definition.manifest,
        storage: { ...definition.manifest.storage, schemaVersion: 1 },
      },
      database: { versions: [v1] },
      // The v1 generator wrote `amount`; reproduce that shape for this test.
      generate: async (ctx: Parameters<typeof definition.generate>[0]) => {
        const world = await definition.generate(ctx);
        world.tables.orders = (world.tables.orders ?? []).map(({ amountCents, ...row }) => ({
          ...row,
          amount: (amountCents as number) / 100,
        }));
        return world;
      },
    };
    const old = await createPrototypeRuntime(oldDefinition, {
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    });
    await old.scenarios.ensureSeeded();
    await old.db.table('orders').put({
      id: 'order_legacy',
      reference: 'ORD-9000',
      customerId: 'x',
      description: 'Legacy',
      amount: 12.34,
      status: 'paid',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const count = await old.db.table('orders').count();
    old.close();

    const migrated = await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    });
    const db = migrated.db as unknown as DashboardDatabase;
    expect(await db.orders.count()).toBe(count);
    expect(await db.orders.get('order_legacy')).toMatchObject({ amountCents: 1234 });
    for (const row of await db.orders.toArray()) {
      expect(Number.isInteger(row.amountCents)).toBe(true);
      expect('amount' in row).toBe(false);
    }
    migrated.close();
  });
});
