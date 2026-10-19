import {
  bucketize,
  type DateRange,
  type Granularity,
  resolveDateRange,
} from '@protoyard/analytics';
import {
  type DateRangeValue,
  DEFAULT_DATE_RANGE,
  fromDateRangeQuery,
  toDateRangeQuery,
} from '@protoyard/analytics-ui/date-range';
import {
  aggregate,
  type BlueprintEntity,
  type BlueprintScreen,
  inputProperty,
} from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

export type AnalyticsScreenSpec = Extract<BlueprintScreen, { type: 'analytics' }>;
export type AnalyticsMeasure = AnalyticsScreenSpec['measures'][number];

export interface AnalyticsQueryState {
  measure: number;
  dimension: string | null;
  dateRange: DateRangeValue;
}

export interface AnalyticsPoint {
  bucket: string;
  dimension: string | null;
  value: number | null;
  records: number;
}

export const INITIAL_ANALYTICS_QUERY: AnalyticsQueryState = {
  measure: 0,
  dimension: null,
  dateRange: DEFAULT_DATE_RANGE,
};

export function parseAnalyticsQuery(
  query: string | URLSearchParams,
  screen: AnalyticsScreenSpec
): AnalyticsQueryState {
  const params =
    typeof query === 'string' ? new URLSearchParams(query.replace(/^[?#]/, '')) : query;
  const measureParam = Number(params.get('measure'));
  const measure =
    Number.isInteger(measureParam) && measureParam >= 0 && measureParam < screen.measures.length
      ? measureParam
      : 0;
  const requestedDimension = params.get('dimension');
  return {
    measure,
    dimension:
      requestedDimension && screen.dimensions.includes(requestedDimension)
        ? requestedDimension
        : null,
    dateRange: fromDateRangeQuery(params, DEFAULT_DATE_RANGE),
  };
}

export function serializeAnalyticsQuery(
  state: AnalyticsQueryState,
  previous?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(previous);
  for (const key of ['range', 'compare', 'by', 'measure', 'dimension']) params.delete(key);
  for (const [key, value] of new URLSearchParams(toDateRangeQuery(state.dateRange))) {
    params.set(key, value);
  }
  if (state.measure !== 0) params.set('measure', String(state.measure));
  if (state.dimension) params.set('dimension', state.dimension);
  return params;
}

export function analyticsRange(state: DateRangeValue, now: number | Date): DateRange {
  return resolveDateRange(state.range, now);
}

function at(row: Row, field: string): number {
  const value = row[field];
  return value instanceof Date
    ? value.getTime()
    : typeof value === 'string'
      ? Date.parse(value)
      : Number.NaN;
}

function inRange(rows: readonly Row[], dateField: string, range: DateRange): Row[] {
  return rows.filter((row) => {
    const instant = at(row, dateField);
    return instant >= range.start && instant < range.end;
  });
}

function dimensionRows(
  rows: readonly Row[],
  field: string | null,
  value: string | null,
  entity: BlueprintEntity
): Row[] {
  if (!field || value === null) return rows as Row[];
  const definition = entity.fields.find((candidate) => candidate.name === field);
  const key = definition ? inputProperty(definition) : field;
  return rows.filter((row) => {
    const raw = row[key];
    if (value === '__none__') {
      return Array.isArray(raw)
        ? raw.length === 0
        : raw === null || raw === undefined || raw === '';
    }
    return Array.isArray(raw)
      ? raw.some((entry) => String(entry) === value)
      : String(raw ?? '') === value;
  });
}

/** Aggregate one chosen measure over date buckets, retaining every declared enum dimension value. */
export function analyticsPoints(
  rows: readonly Row[],
  entity: BlueprintEntity,
  measure: AnalyticsMeasure,
  dateField: string,
  dimension: string | null,
  range: DateRange,
  granularity: Granularity
): AnalyticsPoint[] {
  const dateDefinition = entity.fields.find((candidate) => candidate.name === dateField);
  const dateKey = dateDefinition ? inputProperty(dateDefinition) : dateField;
  const inWindow = inRange(rows, dateKey, range);
  const summary = aggregate(
    inWindow,
    {
      aggregate: measure.aggregate,
      ...(measure.field ? { field: measure.field } : {}),
      ...(dimension ? { groupBy: dimension } : {}),
    },
    entity
  );
  const groups: (string | null)[] = dimension ? summary.groups : [null];
  const valueDefinition = measure.field
    ? entity.fields.find((candidate) => candidate.name === measure.field)
    : undefined;
  const valueKey = valueDefinition ? inputProperty(valueDefinition) : undefined;
  return groups.flatMap((group) => {
    const selected = dimensionRows(inWindow, dimension, group, entity);
    const values = bucketize(selected, {
      range,
      granularity,
      at: (row) => row[dateKey] as string | number,
      aggregate: measure.aggregate,
      ...(valueKey ? { value: (row) => row[valueKey] as number | string | null | undefined } : {}),
    });
    const counts = bucketize(selected, {
      range,
      granularity,
      at: (row) => row[dateKey] as string | number,
      aggregate: 'count',
    });
    return values.map((point, index) => ({
      bucket: new Date(point.at).toISOString(),
      dimension: group,
      value: point.value,
      records: counts[index]?.value ?? 0,
    }));
  });
}

export function formatDimension(
  entity: BlueprintEntity,
  name: string | null,
  value: string | null
): string {
  if (!value) return 'All records';
  if (value === '__none__') return '(No value)';
  const field = entity.fields.find((candidate) => candidate.name === name);
  if (field?.kind === 'enum') return field.labels?.[value] ?? value;
  if (field?.kind === 'boolean') return value === 'true' ? 'Yes' : 'No';
  return value;
}

/** CSV for the aggregate table; prefix formula-like text to keep spreadsheet imports inert. */
export function analyticsCsv(
  points: readonly AnalyticsPoint[],
  entity: BlueprintEntity,
  dimension: string | null
): string {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      'Bucket',
      dimension
        ? (entity.fields.find((field) => field.name === dimension)?.label ?? dimension)
        : 'Dimension',
      'Value',
      'Records',
    ],
    ...points.map((point) => [
      point.bucket,
      formatDimension(entity, dimension, point.dimension),
      point.value,
      point.records,
    ]),
  ];
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
