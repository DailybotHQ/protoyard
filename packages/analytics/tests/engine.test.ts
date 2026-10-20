import { describe, expect, it } from 'vitest';
import {
  aggregate,
  bucketize,
  bucketStart,
  bucketStarts,
  comparisonRange,
  compileFilter,
  DAY_MS,
  DateRangeInputSchema,
  type DateRangePreset,
  delta,
  type FilterGroup,
  FilterGroupSchema,
  FilterSchema,
  filterSchemaFor,
  MAX_BUCKETS,
  MAX_FILTER_NODES,
  measureFilterInput,
  percentile,
  readProperty,
  resolveDateRange,
  SegmentSchema,
} from '../src/index.ts';

const utc = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();
const span = (r: { start: number; end: number }) => [iso(r.start), iso(r.end)];

describe('resolveDateRange', () => {
  // Monday 2026-03-02 09:00 UTC, the preset reference time used by scenarios.
  const now = utc('2026-03-02T09:00:00.000Z');
  const preset = (p: DateRangePreset, at = now) =>
    span(resolveDateRange({ kind: 'preset', preset: p }, at));

  it('resolves day-based presets including today and ending at now', () => {
    expect(preset('today')).toEqual(['2026-03-02T00:00:00.000Z', '2026-03-02T09:00:00.000Z']);
    expect(preset('yesterday')).toEqual(['2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z']);
    expect(preset('last-7-days')).toEqual(['2026-02-24T00:00:00.000Z', '2026-03-02T09:00:00.000Z']);
    expect(preset('last-30-days')[0]).toBe('2026-02-01T00:00:00.000Z');
    expect(preset('last-90-days')[0]).toBe('2025-12-03T00:00:00.000Z');
  });

  it('resolves calendar presets across month and year ends', () => {
    expect(preset('month-to-date')).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-03-02T09:00:00.000Z',
    ]);
    expect(preset('quarter-to-date')[0]).toBe('2026-01-01T00:00:00.000Z');
    expect(preset('year-to-date')[0]).toBe('2026-01-01T00:00:00.000Z');
    expect(preset('last-month')).toEqual(['2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z']);
    // In January, last month is December of the previous year; Q4 starts in October.
    const january = utc('2026-01-15T12:00:00.000Z');
    expect(preset('last-month', january)).toEqual([
      '2025-12-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
    expect(preset('quarter-to-date', utc('2025-11-30T23:59:59.999Z'))[0]).toBe(
      '2025-10-01T00:00:00.000Z'
    );
    // Just after midnight on Jan 1, yesterday is Dec 31.
    expect(preset('yesterday', utc('2026-01-01T00:00:01.000Z'))).toEqual([
      '2025-12-31T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('treats custom days as inclusive and custom instants as half-open', () => {
    expect(
      span(resolveDateRange({ kind: 'custom', start: '2026-03-01', end: '2026-03-07' }, now))
    ).toEqual(['2026-03-01T00:00:00.000Z', '2026-03-08T00:00:00.000Z']);
    expect(
      span(
        resolveDateRange(
          { kind: 'custom', start: '2026-03-01T06:00:00Z', end: '2026-03-01T18:00:00Z' },
          now
        )
      )
    ).toEqual(['2026-03-01T06:00:00.000Z', '2026-03-01T18:00:00.000Z']);
  });

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
  });
});

describe('comparisonRange', () => {
  const range = { start: utc('2026-03-01T00:00:00Z'), end: utc('2026-03-08T00:00:00Z') };

  it('compares with the previous period of the same length', () => {
    expect(span(comparisonRange(range, 'previous-period') as never)).toEqual([
      '2026-02-22T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
    expect(comparisonRange(range, 'none')).toBeNull();
  });

  it('compares with the same span a year earlier, clamping Feb 29', () => {
    expect(span(comparisonRange(range, 'previous-year') as never)).toEqual([
      '2025-03-01T00:00:00.000Z',
      '2025-03-08T00:00:00.000Z',
    ]);
    const leap = { start: utc('2028-02-29T00:00:00Z'), end: utc('2028-03-01T00:00:00Z') };
    expect(span(comparisonRange(leap, 'previous-year') as never)).toEqual([
      '2027-02-28T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
    ]);
  });
});

describe('buckets', () => {
  it('floors to UTC hour, day, week (Monday or Sunday) and month', () => {
    const t = utc('2026-03-04T15:42:00Z'); // a Wednesday
    expect(iso(bucketStart(t, 'hour'))).toBe('2026-03-04T15:00:00.000Z');
    expect(iso(bucketStart(t, 'day'))).toBe('2026-03-04T00:00:00.000Z');
    expect(iso(bucketStart(t, 'week'))).toBe('2026-03-02T00:00:00.000Z');
    expect(iso(bucketStart(t, 'week', { weekStartsOn: 0 }))).toBe('2026-03-01T00:00:00.000Z');
    expect(iso(bucketStart(t, 'month'))).toBe('2026-03-01T00:00:00.000Z');
    // Sunday with Monday weeks belongs to the week that started six days earlier.
    expect(iso(bucketStart(utc('2026-03-08T23:00:00Z'), 'week'))).toBe('2026-03-02T00:00:00.000Z');
  });

  it('lists every bucket overlapping the range, across a year end', () => {
    const range = { start: utc('2025-11-15T00:00:00Z'), end: utc('2026-02-10T00:00:00Z') };
    expect(bucketStarts(range, 'month').map(iso)).toEqual([
      '2025-11-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
    expect(bucketStarts({ start: 10, end: 10 }, 'day')).toEqual([]);
    expect(() => bucketStarts({ start: 0, end: (MAX_BUCKETS + 5) * 3_600_000 }, 'hour')).toThrow(
      RangeError
    );
  });

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

describe('aggregations and deltas', () => {
  const values = [15, 20, 35, 40, 50];

  it('computes every aggregate, with 0 or null for no values', () => {
    expect(aggregate(values, 'count')).toBe(5);
    expect(aggregate(values, 'sum')).toBe(160);
    expect(aggregate(values, 'avg')).toBe(32);
    expect(aggregate(values, 'min')).toBe(15);
    expect(aggregate(values, 'max')).toBe(50);
    expect(aggregate(['a', 'b', 'a', null], 'unique')).toBe(2);
    expect(aggregate([], 'count')).toBe(0);
    expect(aggregate([], 'sum')).toBe(0);
    expect(aggregate([], 'unique')).toBe(0);
    expect(aggregate([], 'avg')).toBeNull();
    expect(aggregate([], 'p95')).toBeNull();
  });

  it('interpolates percentiles between closest ranks', () => {
    expect(percentile(values, 0.5)).toBe(35);
    expect(percentile(values, 0.9)).toBeCloseTo(46, 10);
    expect(percentile(values, 0.95)).toBeCloseTo(48, 10);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(aggregate(values, 'p50')).toBe(35);
    expect(aggregate(values, 'p90')).toBeCloseTo(46, 10);
    // 1..100: p95 = 95.05 with linear interpolation.
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        0.95
      )
    ).toBeCloseTo(95.05, 10);
  });

  it('reports absolute and relative change, null when the base is zero or missing', () => {
    expect(delta(120, 100)).toEqual({ absolute: 20, relative: 0.2 });
    expect(delta(80, 100)).toEqual({ absolute: -20, relative: -0.2 });
    expect(delta(5, -10)).toEqual({ absolute: 15, relative: 1.5 });
    expect(delta(10, 0)).toEqual({ absolute: 10, relative: null });
    expect(delta(null, 3)).toEqual({ absolute: null, relative: null });
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

  it('evaluates every operator, treating missing and empty values as not set', () => {
    const one = (property: string, operator: string, value?: unknown) =>
      run({ combinator: 'and', conditions: [{ property, operator, value } as never] });
    expect(one('properties.plan', 'neq', 'pro')).toEqual(['u2', 'u4']);
    expect(one('properties.seats', 'between', [2, 12])).toEqual(['u1', 'u3']);
    expect(one('properties.seats', 'lt', 5)).toEqual(['u2']);
    expect(one('properties.plan', 'contains', 'PLUS')).toEqual(['u4']);
    expect(one('properties.plan', 'not_contains', 'pro')).toEqual(['u2', 'u4']);
    expect(one('properties.plan', 'starts_with', 'team')).toEqual(['u4']);
    expect(one('properties.country', 'not_in', ['NZ'])).toEqual(['u2', 'u3', 'u4']);
    expect(one('properties.country', 'is_set')).toEqual(['u1', 'u2']);
    expect(one('properties.country', 'is_not_set')).toEqual(['u3', 'u4']);
    expect(one('at', 'gt', '2026-03-02T12:00:00Z')).toEqual(['u3', 'u4']);
    expect(one('at', 'lte', '2026-03-02')).toEqual(['u1']);
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

  it('limits nesting depth and validates saved segments', () => {
    let deep: FilterGroup = { combinator: 'and', conditions: [] };
    for (let i = 0; i < 4; i++) deep = { combinator: 'and', conditions: [deep] };
    expect(FilterSchema.safeParse(deep).success).toBe(false);
    expect(
      SegmentSchema.safeParse({
        id: 'seg_1',
        name: '  ',
        filter: { combinator: 'and', conditions: [] },
      }).success
    ).toBe(false);
    expect(
      SegmentSchema.parse({
        id: 'seg_1',
        name: 'Pro users',
        filter: { combinator: 'and', conditions: [] },
      }).name
    ).toBe('Pro users');
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

describe('bucketize at scale', () => {
  it('handles 50k events into 90 daily buckets', () => {
    const start = utc('2026-01-01T00:00:00Z');
    const rows = Array.from({ length: 50_000 }, (_, i) => ({
      at: start + ((i * 7919) % (90 * DAY_MS)),
      v: i % 100,
    }));
    const range = { start, end: start + 90 * DAY_MS };
    const t0 = performance.now();
    const series = bucketize(rows, {
      range,
      granularity: 'day',
      at: (r) => r.at,
      aggregate: 'sum',
      value: (r) => r.v,
    });
    const elapsed = performance.now() - t0;
    expect(series).toHaveLength(90);
    expect(series.reduce((s, p) => s + (p.value ?? 0), 0)).toBe(rows.reduce((s, r) => s + r.v, 0));
    // Timing is reported, not asserted (the opt-in bench in analytics-generators owns the 10 ms budget).
    console.info(`bucketize 50k→90 days: ${elapsed.toFixed(2)} ms`);
  });
});
