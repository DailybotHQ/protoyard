import { comparisonRange, type DateRange, resolveDateRange } from '@protoyard/analytics';
import {
  type AggregateResult,
  aggregate,
  type BlueprintDashboardWidget,
  type BlueprintEntity,
  type BlueprintField,
  type BlueprintScreen,
  inputProperty,
} from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

export type DashboardScreenSpec = Extract<BlueprintScreen, { type: 'dashboard' }>;
export type DashboardWidget = BlueprintDashboardWidget;

export interface DashboardPeriods {
  current: DateRange;
  previous: DateRange;
}

/** Current and previous spans, anchored to the runtime clock and inclusive of today. */
export function dashboardPeriods(days: 7 | 30 | 90, now: Date | number): DashboardPeriods {
  const input = {
    kind: 'preset' as const,
    preset: `last-${days}-days` as 'last-7-days' | 'last-30-days' | 'last-90-days',
  };
  const current = resolveDateRange(input, now);
  const previous = comparisonRange(current, 'previous-period');
  if (!previous) throw new RangeError('dashboard period needs a previous range');
  return { current, previous };
}

/** Keep rows whose configured time field falls inside the half-open date range. */
export function rowsInPeriod(
  rows: readonly Row[],
  fieldName: string,
  range: DateRange,
  entity: BlueprintEntity
): Row[] {
  const field = entity.fields.find((candidate) => candidate.name === fieldName);
  const key = field ? inputProperty(field) : fieldName;
  return rows.filter((row) => {
    const value = row[key];
    const at =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'string'
          ? Date.parse(value)
          : Number.NaN;
    return Number.isFinite(at) && at >= range.start && at < range.end;
  });
}

function filterValue(row: Row, field: BlueprintField | undefined): unknown {
  return field ? row[inputProperty(field)] : undefined;
}

/** Apply a blueprint widget filter to list rows (aggregate widgets use aggregate's filter). */
export function matchesWidgetFilter(
  row: Row,
  widget: DashboardWidget,
  entity: BlueprintEntity
): boolean {
  if (!widget.filter) return true;
  const field = entity.fields.find((candidate) => candidate.name === widget.filter?.field);
  const raw = filterValue(row, field);
  const values = Array.isArray(widget.filter.value) ? widget.filter.value : [widget.filter.value];
  const compare = (value: unknown): number | string | boolean | null => {
    if (value === null || value === undefined) return null;
    if (
      field?.kind === 'date' ||
      field?.kind === 'datetime' ||
      ['createdAt', 'updatedAt'].includes(widget.filter?.field ?? '')
    ) {
      const at =
        value instanceof Date
          ? value.getTime()
          : typeof value === 'string'
            ? Date.parse(value)
            : Number.NaN;
      return Number.isFinite(at) ? at : null;
    }
    return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
  };
  const wanted = values.map(compare);
  const one = (value: unknown) => {
    const current = compare(value);
    if (current === null) return false;
    if (widget.filter?.op === 'eq' || widget.filter?.op === 'in') return wanted.includes(current);
    const bound = wanted[0];
    if (bound === null || bound === undefined) return false;
    return widget.filter?.op === 'gte' ? current >= bound : current <= bound;
  };
  return Array.isArray(raw) ? raw.some(one) : one(raw);
}

export function listRows(
  rows: readonly Row[],
  widget: Extract<DashboardWidget, { kind: 'list' }>,
  entity: BlueprintEntity
): Row[] {
  const sortField = widget.sort?.field ?? 'createdAt';
  const field = entity.fields.find((candidate) => candidate.name === sortField);
  const direction = widget.sort?.direction ?? 'desc';
  return rows
    .filter((row) => matchesWidgetFilter(row, widget, entity))
    .slice()
    .sort((a, b) => {
      const left = filterValue(a, field) ?? a[sortField] ?? '';
      const right = filterValue(b, field) ?? b[sortField] ?? '';
      const leftValue = left instanceof Date ? left.getTime() : left;
      const rightValue = right instanceof Date ? right.getTime() : right;
      const compare =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));
      return (direction === 'asc' ? 1 : -1) * compare;
    })
    .slice(0, widget.limit);
}

export function aggregateWidget(
  rows: readonly Row[],
  widget: Exclude<DashboardWidget, { kind: 'list' }>,
  entity: BlueprintEntity,
  options: {
    bucket?: { field: string; unit: 'day' | 'week' | 'month' };
    range?: { from: string | Date; to: string | Date };
  } = {}
): AggregateResult {
  const aggregateKind = widget.kind === 'board-summary' ? 'count' : widget.aggregate;
  const field = widget.kind === 'board-summary' ? undefined : widget.field;
  const groupBy =
    widget.kind === 'board-summary'
      ? widget.groupBy
      : widget.kind === 'chart'
        ? widget.groupBy
        : undefined;
  return aggregate(
    rows,
    {
      aggregate: aggregateKind,
      ...(field ? { field } : {}),
      ...(groupBy ? { groupBy } : {}),
      ...('filter' in widget && widget.filter ? { filter: widget.filter } : {}),
      ...(options.bucket ? { bucket: options.bucket } : {}),
      ...(options.range ? { range: options.range } : {}),
    },
    entity
  );
}

/** Per-group labels come from the blueprint when the dimension is an enum. */
export function groupLabel(entity: BlueprintEntity, fieldName: string, value: string): string {
  const field = entity.fields.find((candidate) => candidate.name === fieldName);
  return field?.kind === 'enum' ? (field.labels?.[value] ?? value) : value;
}
