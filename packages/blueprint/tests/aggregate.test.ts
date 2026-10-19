import type { Row } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  aggregate,
  type BlueprintEntity,
  bucketStartUtc,
  createAggregateQuery,
  createEntityServices,
  derivePolicy,
  NO_GROUP,
  parseBlueprint,
} from '../src/index.ts';

/** A fictional order entity covering every kind the aggregates read. */
const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Orders',
  entities: [
    {
      name: 'customer',
      plural: 'customers',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
    {
      name: 'order',
      plural: 'orders',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'status', kind: 'enum', values: ['draft', 'paid', 'refunded'] },
        { name: 'total', kind: 'money' },
        { name: 'items', kind: 'integer' },
        { name: 'score', kind: 'number' },
        { name: 'placedOn', kind: 'date' },
        { name: 'shippedAt', kind: 'datetime' },
        { name: 'customer', kind: 'relation', to: 'customer' },
        { name: 'labels', kind: 'tags' },
        { name: 'rush', kind: 'boolean' },
      ],
      titleField: 'title',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});
const order = blueprint.entities[1] as BlueprintEntity;

const row = (id: number, values: Record<string, unknown>): Row => ({
  id: `order_${id}`,
  title: `Order ${id}`,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  ...values,
});

const rows: Row[] = [
  row(1, {
    status: 'paid',
    total: 1999,
    items: 2,
    score: 0.5,
    placedOn: '2026-05-04',
    shippedAt: '2026-05-05T23:30:00.000Z',
    customerId: 'customer_1',
    labels: ['gift', 'eu'],
    rush: true,
  }),
  row(2, {
    status: 'paid',
    total: 501,
    items: 1,
    score: 1.25,
    placedOn: '2026-05-06',
    shippedAt: null,
    customerId: 'customer_2',
    labels: ['eu'],
    rush: false,
  }),
  row(3, {
    status: 'draft',
    total: 10_000,
    items: 3,
    score: null,
    placedOn: '2026-05-18',
    shippedAt: '2026-05-19T00:10:00.000Z',
    customerId: 'customer_1',
    labels: [],
    rush: false,
  }),
  row(4, {
    status: null,
    total: 1,
    items: 4,
    score: 2,
    placedOn: null,
    shippedAt: null,
    customerId: null,
    labels: [],
    rush: false,
  }),
  // Soft-deleted: never counted.
  row(5, {
    status: 'paid',
    total: 99_999,
    items: 9,
    placedOn: '2026-05-04',
    deletedAt: '2026-05-20T00:00:00.000Z',
  }),
];

describe('aggregate', () => {
  it('counts and sums money as exact integer cents, skipping soft-deleted rows', () => {
    expect(aggregate(rows, {}, order).total).toMatchObject({ count: 4, value: 4 });
    const sum = aggregate(rows, { aggregate: 'sum', field: 'total' }, order);
    expect(sum.total.value).toBe(1999 + 501 + 10_000 + 1);
    expect(Number.isInteger(sum.total.value)).toBe(true);
    expect(sum.valueKind).toBe('money');
    expect(sum.series).toEqual([sum.total]);
  });

  it('averages, with integer rounding for money and integer fields', () => {
    expect(aggregate(rows, { aggregate: 'avg', field: 'total' }, order).total.value).toBe(
      Math.round((1999 + 501 + 10_000 + 1) / 4)
    );
    expect(aggregate(rows, { aggregate: 'avg', field: 'items' }, order).total.value).toBe(3);
    // Number fields keep fractions; null values are skipped.
    expect(aggregate(rows, { aggregate: 'avg', field: 'score' }, order).total.value).toBeCloseTo(
      (0.5 + 1.25 + 2) / 3
    );
  });

  it('takes min and max over numbers and dates (epoch ms)', () => {
    expect(aggregate(rows, { aggregate: 'min', field: 'total' }, order).total.value).toBe(1);
    const latest = aggregate(rows, { aggregate: 'max', field: 'shippedAt' }, order);
    expect(latest.valueKind).toBe('date');
    expect(latest.total.value).toBe(Date.parse('2026-05-19T00:10:00.000Z'));
    expect(aggregate(rows, { aggregate: 'min', field: 'placedOn' }, order).total.value).toBe(
      Date.parse('2026-05-04')
    );
  });

  it('returns null for avg, min and max over no values, and 0 for count and sum', () => {
    const none = { filter: { field: 'status', op: 'eq', value: 'refunded' } } as const;
    expect(aggregate(rows, { ...none }, order).total.value).toBe(0);
    expect(aggregate(rows, { ...none, aggregate: 'sum', field: 'total' }, order).total.value).toBe(
      0
    );
    for (const kind of ['avg', 'min', 'max'] as const) {
      expect(
        aggregate(rows, { ...none, aggregate: kind, field: 'total' }, order).total.value
      ).toBeNull();
    }
  });

  it('groups by enum in declared order, every value present, empty values last', () => {
    const result = aggregate(rows, { aggregate: 'sum', field: 'total', groupBy: 'status' }, order);
    expect(result.groups).toEqual(['draft', 'paid', 'refunded', NO_GROUP]);
    expect(result.series.map((c) => [c.group, c.count, c.value])).toEqual([
      ['draft', 1, 10_000],
      ['paid', 2, 2500],
      ['refunded', 0, 0],
      [NO_GROUP, 1, 1],
    ]);
    expect(result.series.map((c) => c.key)).toEqual([
      '*|draft',
      '*|paid',
      '*|refunded',
      `*|${NO_GROUP}`,
    ]);
  });

  it('groups relations by their id column, tags per item and booleans as text', () => {
    const byCustomer = aggregate(rows, { groupBy: 'customer' }, order);
    expect(byCustomer.series.map((c) => [c.group, c.count])).toEqual([
      ['customer_1', 2],
      ['customer_2', 1],
      [NO_GROUP, 1],
    ]);
    const byLabel = aggregate(rows, { groupBy: 'labels' }, order);
    expect(byLabel.series.map((c) => [c.group, c.count])).toEqual([
      ['eu', 2],
      ['gift', 1],
      [NO_GROUP, 2],
    ]);
    const byRush = aggregate(rows, { groupBy: 'rush' }, order);
    expect(byRush.series.map((c) => [c.group, c.count])).toEqual([
      ['false', 3],
      ['true', 1],
    ]);
  });

  it('buckets by UTC day, week (Monday) and month with contiguous, filled buckets', () => {
    const days = aggregate(rows, { bucket: { field: 'shippedAt', unit: 'day' } }, order);
    expect(days.buckets).toHaveLength(15); // 2026-05-05 … 2026-05-19
    expect(days.buckets[0]).toBe('2026-05-05T00:00:00.000Z');
    expect(days.buckets.at(-1)).toBe('2026-05-19T00:00:00.000Z');
    expect(days.series.filter((c) => c.count > 0).map((c) => c.bucket)).toEqual([
      '2026-05-05T00:00:00.000Z',
      '2026-05-19T00:00:00.000Z',
    ]);
    // Rows without the date stay in the total only.
    expect(days.total.count).toBe(4);
    expect(days.series.reduce((n, c) => n + c.count, 0)).toBe(2);

    const weeks = aggregate(
      rows,
      { aggregate: 'sum', field: 'total', bucket: { field: 'placedOn', unit: 'week' } },
      order
    );
    expect(weeks.series.map((c) => [c.bucket?.slice(0, 10), c.value])).toEqual([
      ['2026-05-04', 2500],
      ['2026-05-11', 0],
      ['2026-05-18', 10_000],
    ]);

    const months = aggregate(
      rows,
      {
        bucket: { field: 'createdAt', unit: 'month' },
        range: { from: '2026-03-15T00:00:00.000Z', to: new Date('2026-06-02T00:00:00.000Z') },
      },
      order
    );
    expect(months.series.map((c) => [c.bucket?.slice(0, 7), c.count])).toEqual([
      ['2026-03', 0],
      ['2026-04', 0],
      ['2026-05', 4],
      ['2026-06', 0],
    ]);
  });

  it('crosses buckets with groups, bucket-major', () => {
    const result = aggregate(
      rows,
      { groupBy: 'status', bucket: { field: 'placedOn', unit: 'week' } },
      order
    );
    expect(result.series).toHaveLength(result.buckets.length * result.groups.length);
    expect(result.series.slice(0, 3).map((c) => c.key)).toEqual([
      '2026-05-04T00:00:00.000Z|draft',
      '2026-05-04T00:00:00.000Z|paid',
      '2026-05-04T00:00:00.000Z|refunded',
    ]);
    expect(result.series.find((c) => c.key === '2026-05-04T00:00:00.000Z|paid')?.count).toBe(2);
  });

  it('filters with eq, in, gte and lte, including dates and array fields', () => {
    const count = (filter: object) =>
      aggregate(rows, { filter: filter as never }, order).total.count;
    expect(count({ field: 'status', op: 'eq', value: 'paid' })).toBe(2);
    expect(count({ field: 'status', op: 'in', value: ['paid', 'draft'] })).toBe(3);
    expect(count({ field: 'total', op: 'gte', value: 1999 })).toBe(2);
    expect(count({ field: 'items', op: 'lte', value: 2 })).toBe(2);
    expect(count({ field: 'placedOn', op: 'gte', value: '2026-05-06' })).toBe(2);
    expect(count({ field: 'labels', op: 'eq', value: 'eu' })).toBe(2);
    expect(count({ field: 'customer', op: 'eq', value: 'customer_1' })).toBe(2);
    expect(count({ field: 'rush', op: 'eq', value: true })).toBe(1);
  });

  it('is deterministic and rejects bad specs', () => {
    const spec = { aggregate: 'sum', field: 'total', groupBy: 'status' } as const;
    expect(aggregate(rows, spec, order)).toEqual(aggregate([...rows].reverse(), spec, order));
    expect(() => aggregate(rows, { aggregate: 'sum' }, order)).toThrow(/needs a field/);
    expect(() =>
      aggregate(rows, {
        bucket: { field: 'createdAt', unit: 'day' },
        range: { from: '2000-01-01', to: '2030-01-01' },
      })
    ).toThrow(/buckets/);
    expect(() =>
      aggregate(rows, {
        bucket: { field: 'createdAt', unit: 'day' },
        range: { from: 'x', to: 'y' },
      })
    ).toThrow(/invalid range/);
  });

  it('works without an entity (raw column names)', () => {
    const result = aggregate(rows, { aggregate: 'sum', field: 'total', groupBy: 'customerId' });
    expect(result.valueKind).toBe('number');
    expect(result.series.find((c) => c.group === 'customer_1')?.value).toBe(11_999);
  });

  it('aggregates 10k rows quickly', () => {
    const many = Array.from({ length: 10_000 }, (_, i) =>
      row(i, {
        status: (['draft', 'paid', 'refunded'] as const)[i % 3],
        total: (i * 37) % 10_000,
        placedOn: new Date(Date.UTC(2026, 0, 1) + (i % 180) * 86_400_000)
          .toISOString()
          .slice(0, 10),
      })
    );
    const started = performance.now();
    const result = aggregate(
      many,
      {
        aggregate: 'sum',
        field: 'total',
        groupBy: 'status',
        bucket: { field: 'placedOn', unit: 'day' },
      },
      order
    );
    const ms = performance.now() - started;
    expect(result.total.count).toBe(10_000);
    expect(result.buckets).toHaveLength(180);
    console.info(`aggregate 10k rows: ${ms.toFixed(2)} ms`);
    // Target < 20 ms on a quiet machine; generous bound for loaded runners.
    expect(ms).toBeLessThan(400);
  });
});

describe('bucketStartUtc', () => {
  it('starts weeks on Monday and months on the 1st, in UTC', () => {
    const sunday = Date.parse('2026-05-10T23:59:00.000Z');
    expect(new Date(bucketStartUtc(sunday, 'week')).toISOString()).toBe('2026-05-04T00:00:00.000Z');
    expect(new Date(bucketStartUtc(sunday, 'month')).toISOString()).toBe(
      '2026-05-01T00:00:00.000Z'
    );
  });
});

describe('createAggregateQuery on the real runtime', () => {
  let harness = createHarness(createBlueprintDefinition('aggregate-owner'));
  afterEach(() => harness.closeAll());

  it('reads through the entity service and updates after a mutation', async () => {
    harness = createHarness(createBlueprintDefinition('aggregate-owner'));
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, helpdeskBlueprint);
    const query = createAggregateQuery(services, {
      entity: 'invoice',
      aggregate: 'sum',
      field: 'amount',
    });
    const invoices = await services.invoice!.list();
    const before = await query();
    expect(before?.valueKind).toBe('money');
    expect(before?.total.value).toBe(invoices.reduce((n, r) => n + (r.amount as number), 0));
    await services.invoice!.create({ number: 'INV-AGG-1', amount: 12_345 });
    expect((await query())?.total.value).toBe((before?.total.value ?? 0) + 12_345);

    const byStatus = await createAggregateQuery(services, {
      entity: 'ticket',
      groupBy: 'status',
    })();
    expect(byStatus?.groups.slice(0, 3)).toEqual(['open', 'pending', 'solved']);
    expect(byStatus?.total.count).toBe((await services.ticket!.list()).length);
  });

  it('resolves to null when the persona cannot read the entity', async () => {
    // Same fixture, but the viewer role may read customers only.
    const restricted = parseBlueprint({
      ...helpdeskBlueprint,
      roles: [
        ...helpdeskBlueprint.roles.filter((role) => role.name !== 'viewer'),
        { name: 'viewer', permissions: { customer: ['read'] } },
      ],
    });
    harness = createHarness({
      ...createBlueprintDefinition('aggregate-viewer'),
      policy: derivePolicy(restricted),
    });
    const runtime = await harness.boot('viewer');
    const services = createEntityServices(runtime, restricted);
    expect(await createAggregateQuery(services, { entity: 'invoice' })()).toBeNull();
    expect((await createAggregateQuery(services, { entity: 'customer' })())?.total.count).toBe(
      (await services.customer!.list()).length
    );
  });

  it('rejects an unknown entity up front', () => {
    expect(() => createAggregateQuery({}, { entity: 'ghost' })).toThrow(/unknown entity/);
  });
});
