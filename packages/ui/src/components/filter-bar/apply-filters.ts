import type {
  DateRangeFilterValue,
  FilterChip,
  FilterField,
  FilterOption,
  FilterValue,
  FilterValues,
} from './types.ts';

function fieldKey<T>(field: FilterField<T>): string {
  return field.key ?? field.id;
}

/** Read the row value a filter field inspects. */
export function readFilterValue<T>(row: T, field: FilterField<T>): unknown {
  if (field.accessor) return field.accessor(row);
  return (row as Record<string, unknown>)[fieldKey(field)];
}

function asStringList(value: FilterValue | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function isDateRange(value: FilterValue | null | undefined): value is DateRangeFilterValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a stored value counts as an active filter for its field kind. */
export function isFilterActive(
  field: FilterField<unknown>,
  value: FilterValue | null | undefined
): boolean {
  if (value == null) return false;
  switch (field.kind) {
    case 'enum':
    case 'relation':
      return asStringList(value).length > 0;
    case 'boolean':
      return typeof value === 'boolean';
    case 'date-range':
      return isDateRange(value) && Boolean(value.from || value.to);
    default:
      return false;
  }
}

/** True when at least one field has an active value. */
export function hasActiveFilters(fields: FilterField<unknown>[], values: FilterValues): boolean {
  return fields.some((field) => isFilterActive(field, values[field.id]));
}

function dayStartMs(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function dayEndMs(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function rowDateMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    // Prefer calendar-day strings so hash-query values match row ISO dates.
    const day = dayStartMs(value);
    if (day != null) return day;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function optionLabel(options: FilterOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function rowMatchesField<T>(
  row: T,
  field: FilterField<T>,
  value: FilterValue | null | undefined
): boolean {
  if (!isFilterActive(field, value)) return true;
  const rowValue = readFilterValue(row, field);

  switch (field.kind) {
    case 'enum':
    case 'relation': {
      const selected = asStringList(value);
      const text = rowValue == null ? '' : String(rowValue);
      return selected.includes(text);
    }
    case 'boolean': {
      return Boolean(rowValue) === value;
    }
    case 'date-range': {
      if (!isDateRange(value)) return true;
      const ms = rowDateMs(rowValue);
      if (ms == null) return false;
      if (value.from) {
        const from = dayStartMs(value.from);
        if (from != null && ms < from) return false;
      }
      if (value.to) {
        const to = dayEndMs(value.to);
        if (to != null && ms > to) return false;
      }
      return true;
    }
    default:
      return true;
  }
}

/**
 * Pure predicate: keep rows that match every active filter (AND across fields).
 * Enum/relation multi-select is OR within the field.
 */
export function applyFilters<T>(
  rows: readonly T[],
  fields: FilterField<T>[],
  values: FilterValues
): T[] {
  if (!hasActiveFilters(fields as FilterField<unknown>[], values)) return [...rows];
  return rows.filter((row) =>
    fields.every((field) => rowMatchesField(row, field, values[field.id]))
  );
}

/** Build removable chips for the active filter values. */
export function buildFilterChips(
  fields: FilterField<unknown>[],
  values: FilterValues
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const field of fields) {
    const value = values[field.id];
    if (!isFilterActive(field, value)) continue;

    if (field.kind === 'enum' || field.kind === 'relation') {
      const selected = asStringList(value);
      const multi = Boolean(field.multiple) || selected.length > 1;
      for (const item of selected) {
        chips.push({
          key: multi ? `${field.id}:${item}` : field.id,
          fieldId: field.id,
          label: `${field.label}: ${optionLabel(field.options, item)}`,
          value: multi ? item : undefined,
        });
      }
      continue;
    }

    if (field.kind === 'boolean' && typeof value === 'boolean') {
      const trueLabel = field.trueLabel ?? 'Yes';
      const falseLabel = field.falseLabel ?? 'No';
      chips.push({
        key: field.id,
        fieldId: field.id,
        label: `${field.label}: ${value ? trueLabel : falseLabel}`,
      });
      continue;
    }

    if (field.kind === 'date-range' && isDateRange(value)) {
      const from = value.from?.trim() || '';
      const to = value.to?.trim() || '';
      let rangeLabel: string;
      if (from && to) rangeLabel = `${from} → ${to}`;
      else if (from) rangeLabel = `from ${from}`;
      else rangeLabel = `until ${to}`;
      chips.push({
        key: field.id,
        fieldId: field.id,
        label: `${field.label}: ${rangeLabel}`,
      });
    }
  }
  return chips;
}

/**
 * Clear one chip from the values map.
 * Multi enum/relation chips remove a single value; others clear the field.
 */
export function clearFilterChip(
  fields: FilterField<unknown>[],
  values: FilterValues,
  chip: Pick<FilterChip, 'fieldId' | 'value'>
): FilterValues {
  const field = fields.find((f) => f.id === chip.fieldId);
  if (!field) return { ...values };

  const next: FilterValues = { ...values };
  const current = values[chip.fieldId];

  if (
    (field.kind === 'enum' || field.kind === 'relation') &&
    chip.value != null &&
    (field.multiple || asStringList(current).length > 1)
  ) {
    const remaining = asStringList(current).filter((v) => v !== chip.value);
    if (remaining.length === 0) {
      next[chip.fieldId] = null;
    } else if (field.multiple) {
      next[chip.fieldId] = remaining;
    } else {
      next[chip.fieldId] = remaining[0];
    }
    return next;
  }

  next[chip.fieldId] = null;
  return next;
}

/** Drop every active filter (all field ids set to `null`). */
export function resetFilterValues(fields: FilterField<unknown>[]): FilterValues {
  const next: FilterValues = {};
  for (const field of fields) next[field.id] = null;
  return next;
}

/** Normalize a multi/single enum or relation write into the stored shape. */
export function setListFilterValue(
  field: FilterField<unknown>,
  previous: FilterValue | null | undefined,
  optionValue: string,
  checked: boolean
): FilterValue | null {
  if (field.kind !== 'enum' && field.kind !== 'relation') return previous ?? null;
  if (!field.multiple) {
    return checked ? optionValue : null;
  }
  const set = new Set(asStringList(previous));
  if (checked) set.add(optionValue);
  else set.delete(optionValue);
  const list = [...set];
  return list.length > 0 ? list : null;
}
