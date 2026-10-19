import { PermissionDeniedError, type Row } from '@protoyard/core';
import type {
  Aggregate,
  BlueprintEntity,
  BlueprintField,
  BlueprintScreenFilter,
} from './schema.ts';
import type { EntityServices } from './services.ts';
import { inputProperty } from './validation.ts';

/**
 * Aggregates for dashboards, boards, analytics and calendars, computed in
 * one pass over entity rows. Pure and framework-agnostic: screens wrap
 * `createAggregateQuery` in `liveQuery`. Buckets are UTC (days start at
 * midnight, weeks on Monday, months on the 1st), so results never depend on
 * the viewer's time zone.
 */

export type BucketUnit = 'day' | 'week' | 'month';

export interface AggregateSpec {
  /** Default `count`. */
  aggregate?: Aggregate;
  /** Required for every aggregate except `count`. */
  field?: string;
  /** One series entry per value; array fields (tags, many-relations) count once per item. */
  groupBy?: string;
  /** Time buckets over a date or datetime field (or `createdAt` / `updatedAt`). */
  bucket?: { field: string; unit: BucketUnit };
  filter?: BlueprintScreenFilter;
  /** Buckets to fill when bucketing (inclusive); defaults to the data's first and last bucket. */
  range?: { from: string | Date; to: string | Date };
}

/** One cell: a bucket × group combination (either may be null when not used). */
export interface AggregateCell {
  /** `<bucket|*>|<group|*>`, stable across runs. */
  key: string;
  /** Bucket start (ISO, UTC) or null without `bucket`. */
  bucket: string | null;
  /** Group value or null without `groupBy`; `NO_GROUP` collects rows without a value. */
  group: string | null;
  /** Rows that matched (after filter). */
  count: number;
  /** null for avg/min/max over no values. */
  value: number | null;
}

export interface AggregateResult {
  aggregate: Aggregate;
  /**
   * How to format `value`: `money` is integer cents, `date` is epoch
   * milliseconds (min/max over date fields), `number` otherwise.
   */
  valueKind: 'number' | 'money' | 'date';
  /** Over every matching row. */
  total: AggregateCell;
  /** Ordered: buckets ascending, then groups (enum order, else sorted, `NO_GROUP` last). */
  series: AggregateCell[];
  /** Group order used in `series`. */
  groups: string[];
  /** Bucket starts used in `series`, contiguous. */
  buckets: string[];
}

/** Group key for rows whose groupBy value is empty. */
export const NO_GROUP = '__none__';
/** Upper bound on filled buckets, so a typo in a range cannot allocate millions of cells. */
export const MAX_BUCKETS = 5000;

const MS_PER_DAY = 86_400_000;
const MANAGED_DATES = new Set(['createdAt', 'updatedAt']);

/** UTC start of the bucket containing `ms`. */
export function bucketStartUtc(ms: number, unit: BucketUnit): number {
  const day = Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
  if (unit === 'day') return day;
  if (unit === 'week') return day - ((new Date(day).getUTCDay() + 6) % 7) * MS_PER_DAY;
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextBucket(start: number, unit: BucketUnit): number {
  if (unit === 'day') return start + MS_PER_DAY;
  if (unit === 'week') return start + 7 * MS_PER_DAY;
  const date = new Date(start);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Epoch ms for a date-like value; NaN when it is not one. */
function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'string' && value !== '' ? Date.parse(value) : Number.NaN;
}

function fieldOf(entity: BlueprintEntity | undefined, name: string): BlueprintField | undefined {
  return entity?.fields.find((f) => f.name === name);
}

/** Row property that stores a field (`customer` → `customerId`). */
function propertyOf(entity: BlueprintEntity | undefined, name: string): string {
  const field = fieldOf(entity, name);
  return field ? inputProperty(field) : name;
}

function groupKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    const keys = value.filter((v) => v !== null && v !== undefined && v !== '').map(String);
    return keys.length > 0 ? [...new Set(keys)] : [NO_GROUP];
  }
  return value === null || value === undefined || value === '' ? [NO_GROUP] : [String(value)];
}

function makeFilter(
  entity: BlueprintEntity | undefined,
  filter: BlueprintScreenFilter | undefined
): (row: Row) => boolean {
  if (!filter) return () => true;
  const prop = propertyOf(entity, filter.field);
  const kind = MANAGED_DATES.has(filter.field) ? 'datetime' : fieldOf(entity, filter.field)?.kind;
  const isDate = kind === 'date' || kind === 'datetime';
  const comparable = (v: unknown): number | string | boolean | null => {
    if (v === null || v === undefined) return null;
    if (isDate) return toMs(v);
    return typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
  };
  const wanted = (Array.isArray(filter.value) ? filter.value : [filter.value]).map(comparable);
  const matchOne = (v: unknown): boolean => {
    const c = comparable(v);
    if (c === null) return false;
    if (filter.op === 'eq' || filter.op === 'in') return wanted.includes(c);
    const bound = wanted[0];
    if (bound === null || bound === undefined) return false;
    return filter.op === 'gte' ? c >= bound : c <= bound;
  };
  return (row) => {
    const value = row[prop];
    return Array.isArray(value) ? value.some(matchOne) : matchOne(value);
  };
}

interface Acc {
  count: number;
  n: number;
  sum: number;
  min: number;
  max: number;
}
const newAcc = (): Acc => ({
  count: 0,
  n: 0,
  sum: 0,
  min: Number.POSITIVE_INFINITY,
  max: Number.NEGATIVE_INFINITY,
});

function add(acc: Acc, value: number | null) {
  acc.count++;
  if (value === null) return;
  acc.n++;
  acc.sum += value;
  if (value < acc.min) acc.min = value;
  if (value > acc.max) acc.max = value;
}

function finish(acc: Acc, aggregate: Aggregate, roundAvg: boolean): number | null {
  switch (aggregate) {
    case 'count':
      return acc.count;
    case 'sum':
      return acc.sum;
    case 'avg':
      if (acc.n === 0) return null;
      return roundAvg ? Math.round(acc.sum / acc.n) : acc.sum / acc.n;
    case 'min':
      return acc.n === 0 ? null : acc.min;
    case 'max':
      return acc.n === 0 ? null : acc.max;
  }
}

/**
 * Aggregates `rows` (soft-deleted rows are skipped). Pass the blueprint
 * entity so relation fields map to their `<name>Id` columns, enum groups keep
 * their declared order (every value appears, even at zero), and money and
 * dates are typed. Money sums stay integer cents; money and integer averages
 * are rounded to integers.
 */
export function aggregate(
  rows: readonly Row[],
  spec: AggregateSpec,
  entity?: BlueprintEntity
): AggregateResult {
  const kind = spec.aggregate ?? 'count';
  if (kind !== 'count' && !spec.field) {
    throw new RangeError(`aggregate(): "${kind}" needs a field`);
  }
  const valueField = spec.field ? fieldOf(entity, spec.field) : undefined;
  const valueIsDate =
    valueField?.kind === 'date' ||
    valueField?.kind === 'datetime' ||
    (spec.field !== undefined && MANAGED_DATES.has(spec.field));
  const valueKind: AggregateResult['valueKind'] =
    kind === 'count'
      ? 'number'
      : valueField?.kind === 'money'
        ? 'money'
        : valueIsDate
          ? 'date'
          : 'number';
  const roundAvg = valueField?.kind === 'money' || valueField?.kind === 'integer';
  const valueProp = spec.field ? propertyOf(entity, spec.field) : null;
  const readValue = (row: Row): number | null => {
    if (valueProp === null) return null;
    const raw = row[valueProp];
    if (valueIsDate) {
      const ms = toMs(raw);
      return Number.isNaN(ms) ? null : ms;
    }
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };

  const groupProp = spec.groupBy ? propertyOf(entity, spec.groupBy) : null;
  const bucketProp = spec.bucket ? propertyOf(entity, spec.bucket.field) : null;
  const unit = spec.bucket?.unit;
  const keep = makeFilter(entity, spec.filter);

  const total = newAcc();
  const cells = new Map<string, Acc>();
  const seenGroups = new Set<string>();
  let firstBucket = Number.POSITIVE_INFINITY;
  let lastBucket = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    if (row.deletedAt || !keep(row)) continue;
    const value = readValue(row);
    add(total, value);

    let bucket: number | null = null;
    if (bucketProp !== null && unit) {
      const ms = toMs(row[bucketProp]);
      if (Number.isNaN(ms)) continue; // no date: counted in total, not in a bucket
      bucket = bucketStartUtc(ms, unit);
      if (bucket < firstBucket) firstBucket = bucket;
      if (bucket > lastBucket) lastBucket = bucket;
    }
    const groups = groupProp === null ? [null] : groupKeys(row[groupProp]);
    for (const group of groups) {
      if (group !== null) seenGroups.add(group);
      const key = `${bucket === null ? '*' : bucket}|${group ?? '*'}`;
      let acc = cells.get(key);
      if (!acc) {
        acc = newAcc();
        cells.set(key, acc);
      }
      add(acc, value);
    }
  }

  // Group order: enum values as declared (all of them), then other seen values sorted.
  let groups: string[] = [];
  if (groupProp !== null) {
    const declared =
      fieldOf(entity, spec.groupBy as string)?.kind === 'enum'
        ? (fieldOf(entity, spec.groupBy as string) as { values: string[] }).values
        : [];
    const rest = [...seenGroups]
      .filter((g) => g !== NO_GROUP && !declared.includes(g))
      .sort((a, b) => a.localeCompare(b));
    groups = [...declared, ...rest, ...(seenGroups.has(NO_GROUP) ? [NO_GROUP] : [])];
  }

  // Contiguous buckets over the range, or the data's span.
  const buckets: number[] = [];
  if (unit) {
    let from = firstBucket;
    let to = lastBucket;
    if (spec.range) {
      from = bucketStartUtc(toMs(spec.range.from), unit);
      to = bucketStartUtc(toMs(spec.range.to), unit);
      if (Number.isNaN(from) || Number.isNaN(to))
        throw new RangeError('aggregate(): invalid range');
    }
    for (let b = from; b <= to; b = nextBucket(b, unit)) {
      buckets.push(b);
      if (buckets.length > MAX_BUCKETS) {
        throw new RangeError(`aggregate(): more than ${MAX_BUCKETS} buckets`);
      }
    }
  }

  const cell = (bucket: number | null, group: string | null): AggregateCell => {
    const key = `${bucket === null ? '*' : bucket}|${group ?? '*'}`;
    const iso = bucket === null ? null : new Date(bucket).toISOString();
    return {
      key: `${iso ?? '*'}|${group ?? '*'}`,
      bucket: iso,
      group,
      count: cells.get(key)?.count ?? 0,
      value: finish(cells.get(key) ?? newAcc(), kind, roundAvg),
    };
  };

  const series: AggregateCell[] = [];
  const bucketList = unit ? buckets : [null];
  const groupList = groupProp === null ? [null] : groups;
  for (const bucket of bucketList) {
    for (const group of groupList) series.push(cell(bucket, group));
  }

  return {
    aggregate: kind,
    valueKind,
    total: {
      key: '*|*',
      bucket: null,
      group: null,
      count: total.count,
      value: finish(total, kind, roundAvg),
    },
    series,
    groups,
    buckets: buckets.map((b) => new Date(b).toISOString()),
  };
}

/** A spec bound to an entity, as dashboard widgets and analytics measures declare it. */
export type AggregateQuerySpec = AggregateSpec & { entity: string };

/**
 * A querier for `liveQuery`: reads through the entity service (so
 * `session.assert(<entity>:read)` applies) and resolves to null when the
 * active persona cannot read the entity, like the generated Home counts.
 */
export function createAggregateQuery(
  services: EntityServices,
  spec: AggregateQuerySpec
): () => Promise<AggregateResult | null> {
  const service = services[spec.entity];
  if (!service) throw new RangeError(`createAggregateQuery(): unknown entity "${spec.entity}"`);
  return async () => {
    let rows: Row[];
    try {
      rows = await service.list();
    } catch (error) {
      if (error instanceof PermissionDeniedError) return null;
      throw error;
    }
    return aggregate(rows, spec, service.entity);
  };
}
