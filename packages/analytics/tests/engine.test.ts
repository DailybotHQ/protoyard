import { describe, expect, it } from 'vitest';
import {
  bucketize,
  compileFilter,
  DateRangeInputSchema,
  type FilterGroup,
  FilterGroupSchema,
  FilterSchema,
  filterSchemaFor,
  MAX_CUSTOM_RANGE_DAYS,
  MAX_FILTER_NODES,
  measureFilterInput,
  readProperty,
  SegmentSchema,
} from '../src/index.ts';

const utc = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('resolveDateRange', () => {
  it('validates range inputs', () => {
    expect(DateRangeInputSchema.safeParse({ kind: 'preset', preset: 'last-7-days' }).success).toBe(
      true
    );
    expect(DateRangeInputSchema.safeParse({ kind: 'preset', preset: 'last-8-days' }).success).toBe(
      false
    );
    const backwards = DateRangeInputSchema.safeParse({
      kind: 'custom',
      start: '2026-03-07',
      end: '2026-03-01',
    });
    expect(backwards.success).toBe(false);
    expect(backwards.error?.issues[0]?.path).toEqual(['end']);
    // A single inclusive day is a valid range.
    expect(
      DateRangeInputSchema.safeParse({ kind: 'custom', start: '2026-03-01', end: '2026-03-01' })
        .success
    ).toBe(true);
    // Custom spans are capped so a shared link cannot ask for unbounded buckets.
    const huge = DateRangeInputSchema.safeParse({
      kind: 'custom',
      start: '2000-01-01',
      end: '2030-01-01',
    });
    expect(huge.success).toBe(false);
    expect(huge.error?.issues[0]?.message).toContain(`${MAX_CUSTOM_RANGE_DAYS} days`);
    expect(
      DateRangeInputSchema.safeParse({ kind: 'custom', start: '2020-01-01', end: '2029-12-31' })
        .success
    ).toBe(true);
  });
});

describe('buckets', () => {
  it('aggregates rows into a complete series with empty buckets', () => {
    const range = { start: utc('2026-03-01T00:00:00Z'), end: utc('2026-03-04T00:00:00Z') };
    const rows = [
      { at: '2026-03-01T10:00:00.000Z', amount: 500, userId: 'u1' },
      { at: '2026-03-01T11:00:00.000Z', amount: 1500, userId: 'u1' },
      { at: utc('2026-03-03T23:59:59Z'), amount: 1000, userId: 'u2' },
      { at: '2026-03-04T00:00:00.000Z', amount: 9999, userId: 'u3' }, // outside (end is exclusive)
      { at: '2026-02-28T23:59:59.000Z', amount: 9999, userId: 'u3' }, // outside
    ];
    const at = (r: (typeof rows)[number]) => r.at;
    expect(bucketize(rows, { range, granularity: 'day', at }).map((p) => p.value)).toEqual([
      2, 0, 1,
    ]);
    expect(
      bucketize(rows, {
        range,
        granularity: 'day',
        at,
        aggregate: 'sum',
        value: (r) => r.amount,
      }).map((p) => p.value)
    ).toEqual([2000, 0, 1000]);
    expect(
      bucketize(rows, {
        range,
        granularity: 'day',
        at,
        aggregate: 'avg',
        value: (r) => r.amount,
      }).map((p) => p.value)
    ).toEqual([1000, null, 1000]);
    expect(
      bucketize(rows, {
        range,
        granularity: 'week',
        at,
        aggregate: 'unique',
        value: (r) => r.userId,
      }).map((p) => [iso(p.at), p.value])
    ).toEqual([
      ['2026-02-23T00:00:00.000Z', 1],
      ['2026-03-02T00:00:00.000Z', 1],
    ]);
  });
});

describe('filters and segments', () => {
  const rows = [
    {
      type: 'signup',
      userId: 'u1',
      at: '2026-03-01T10:00:00Z',
      properties: { plan: 'pro', country: 'NZ', seats: 5 },
    },
    {
      type: 'signup',
      userId: 'u2',
      at: '2026-03-02T10:00:00Z',
      properties: { plan: 'free', country: 'CA', seats: 1 },
    },
    {
      type: 'checkout',
      userId: 'u3',
      at: '2026-03-03T10:00:00Z',
      properties: { plan: 'pro', seats: 12 },
    },
    {
      type: 'checkout',
      userId: 'u4',
      at: '2026-03-04T10:00:00Z',
      properties: { plan: 'Team Plus', country: '' },
    },
  ];
  const run = (filter: FilterGroup) =>
    rows.filter(compileFilter(FilterSchema.parse(filter))).map((r) => r.userId);

  it('combines conditions with AND and OR, including nested groups', () => {
    expect(
      run({
        combinator: 'and',
        conditions: [
          { property: 'type', operator: 'eq', value: 'signup' },
          { property: 'properties.plan', operator: 'eq', value: 'pro' },
        ],
      })
    ).toEqual(['u1']);
    expect(
      run({
        combinator: 'or',
        conditions: [
          { property: 'properties.seats', operator: 'gte', value: 10 },
          {
            combinator: 'and',
            conditions: [
              { property: 'type', operator: 'eq', value: 'signup' },
              { property: 'properties.country', operator: 'in', value: ['CA'] },
            ],
          },
        ],
      })
    ).toEqual(['u2', 'u3']);
    expect(run({ combinator: 'and', conditions: [] })).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('rejects malformed conditions with field errors', () => {
    const bad = (condition: unknown) =>
      FilterSchema.safeParse({ combinator: 'and', conditions: [condition] }).error?.issues.map(
        (i) => i.path.join('.')
      );
    expect(bad({ property: 'plan', operator: 'eq' })).toEqual(['conditions.0.value']);
    expect(bad({ property: 'plan', operator: 'in', value: [] })).toEqual(['conditions.0.value']);
    expect(bad({ property: 'seats', operator: 'between', value: [1] })).toEqual([
      'conditions.0.value',
    ]);
    expect(bad({ property: 'plan', operator: 'is_set', value: 'x' })).toEqual([
      'conditions.0.value',
    ]);
    expect(bad({ property: '__proto__.polluted', operator: 'eq', value: 1 })).toEqual([
      'conditions.0.property',
    ]);
    expect(bad({ property: 'a b', operator: 'eq', value: 1 })).toEqual(['conditions.0.property']);
  });

  it('rejects unknown properties and operators that do not fit the property type', () => {
    const schema = filterSchemaFor({ type: 'string', 'properties.seats': 'number', at: 'date' });
    const result = schema.safeParse({
      combinator: 'and',
      conditions: [
        { property: 'type', operator: 'eq', value: 'signup' },
        { property: 'properties.region', operator: 'eq', value: 'EU' },
        { combinator: 'or', conditions: [{ property: 'type', operator: 'gt', value: 'a' }] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['conditions.1.property', 'Unknown property "properties.region"'],
      ['conditions.2.conditions.0.operator', '"greater than" does not apply to string properties'],
    ]);
  });

  it('refuses (never throws on) filters nested thousands of levels deep', () => {
    let deep: unknown = { combinator: 'and', conditions: [] };
    for (let i = 0; i < 5000; i++) deep = { combinator: 'and', conditions: [deep] };
    expect(measureFilterInput(deep).exceeded).toBe(true);
    expect(FilterSchema.safeParse(deep).success).toBe(false);
    expect(FilterGroupSchema.safeParse(deep).success).toBe(false);
    expect(SegmentSchema.safeParse({ id: 'seg_1', name: 'Deep', filter: deep }).success).toBe(
      false
    );
    expect(filterSchemaFor({ type: 'string' }).safeParse(deep).success).toBe(false);

    const wide = {
      combinator: 'or',
      conditions: Array.from({ length: 11 }, () => ({
        combinator: 'and',
        conditions: Array.from({ length: 50 }, () => ({
          property: 'type',
          operator: 'eq',
          value: 'a',
        })),
      })),
    };
    expect(measureFilterInput(wide).exceeded).toBe(true);
    expect(FilterSchema.safeParse(wide).success).toBe(false);
    expect(MAX_FILTER_NODES).toBe(500);

    let four: FilterGroup = { combinator: 'and', conditions: [] };
    for (let i = 0; i < 3; i++) four = { combinator: 'and', conditions: [four] };
    expect(measureFilterInput(four)).toEqual({ depth: 4, nodes: 4, exceeded: false });
    expect(FilterSchema.safeParse(four).success).toBe(true);
  });

  it('reads own properties only', () => {
    expect(readProperty({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(readProperty({ a: 1 }, 'toString')).toBeUndefined();
    expect(readProperty(null, 'a')).toBeUndefined();
  });
});
