import { comparisonRange, type DateRange, resolveDateRange } from '@protoyard/analytics';
import type { DateRangeValue } from '@protoyard/analytics-ui/date-range';
import type { Row } from '@protoyard/core';
import type { AnalyticsFields } from './adapter.ts';

/**
 * Pure dashboard numbers from event rows: the totals for the selected range,
 * the same numbers for the comparison range, and a breakdown by type.
 * Deterministic for the same rows, range and simulated "now".
 */

export interface DashboardNumbers {
  range: DateRange;
  previous: DateRange | null;
  events: { current: number; previous: number | null };
  value: { current: number; previous: number | null } | null;
  byType: { type: string; count: number; previous: number | null }[];
}

function timeOf(row: Row, field: string): number | null {
  const raw = row[field];
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

const within = (rows: readonly Row[], field: string, range: DateRange) =>
  rows.filter((row) => {
    const at = timeOf(row, field);
    return at !== null && at >= range.start && at < range.end;
  });

const sum = (rows: readonly Row[], field: string) =>
  rows.reduce(
    (total, row) => total + (typeof row[field] === 'number' ? (row[field] as number) : 0),
    0
  );

export function dashboardNumbers(
  rows: readonly Row[],
  fields: AnalyticsFields,
  value: DateRangeValue,
  now: number
): DashboardNumbers {
  const range = resolveDateRange(value.range, now);
  const previous = comparisonRange(range, value.comparison);
  const current = within(rows, fields.dateField, range);
  const before = previous ? within(rows, fields.dateField, previous) : null;
  const typeField = fields.typeField;
  return {
    range,
    previous,
    events: { current: current.length, previous: before ? before.length : null },
    value: fields.valueField
      ? {
          current: sum(current, fields.valueField),
          previous: before ? sum(before, fields.valueField) : null,
        }
      : null,
    byType: typeField
      ? fields.typeValues.map((type) => ({
          type,
          count: current.filter((row) => row[typeField] === type).length,
          previous: before ? before.filter((row) => row[typeField] === type).length : null,
        }))
      : [],
  };
}
