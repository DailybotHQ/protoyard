/** Option shown in enum and relation filter controls. */
export interface FilterOption {
  value: string;
  label: string;
}

interface FilterFieldBase<T> {
  /** Stable id used as the key in `FilterValues` and chip keys. */
  id: string;
  /** Human label for the control and chips. */
  label: string;
  /**
   * Row property name when no `accessor` is provided.
   * Defaults to `id`.
   */
  key?: string;
  /** Custom value reader; takes precedence over `key`. */
  // Method syntax keeps the parameter bivariant, so a FilterField<Deal> is usable where FilterField<unknown> is expected.
  accessor?(row: T): unknown;
}

/** Discrete set of string values (status, stage, category…). */
export interface EnumFilterField<T = unknown> extends FilterFieldBase<T> {
  kind: 'enum';
  options: FilterOption[];
  /** When true, several values may be active (OR match). Default false. */
  multiple?: boolean;
}

/**
 * Foreign-key style filter: options are related entity ids.
 * Matching uses the same string equality as `enum`.
 */
export interface RelationFilterField<T = unknown> extends FilterFieldBase<T> {
  kind: 'relation';
  options: FilterOption[];
  multiple?: boolean;
}

/** True / false / any. */
export interface BooleanFilterField<T = unknown> extends FilterFieldBase<T> {
  kind: 'boolean';
  trueLabel?: string;
  falseLabel?: string;
}

/**
 * Inclusive day range. Values are ISO calendar dates `YYYY-MM-DD`
 * so they survive URL / hash serialization without timezone drift.
 */
export interface DateRangeFilterField<T = unknown> extends FilterFieldBase<T> {
  kind: 'date-range';
}

export type FilterField<T = unknown> =
  | EnumFilterField<T>
  | RelationFilterField<T>
  | BooleanFilterField<T>
  | DateRangeFilterField<T>;

/** Inclusive calendar-day bounds as plain ISO date strings. */
export interface DateRangeFilterValue {
  from?: string;
  to?: string;
}

/**
 * Plain JSON-safe filter payload for one field.
 * Safe to put in the hash query (JSON or URLSearchParams).
 */
export type FilterValue = string | string[] | boolean | DateRangeFilterValue;

/**
 * Active filters keyed by field `id`.
 * Absent, `null`, or empty (see `isFilterActive`) means the field is inactive.
 */
export type FilterValues = Record<string, FilterValue | null | undefined>;

/** One removable chip rendered for an active filter. */
export interface FilterChip {
  /** Unique chip id (`fieldId` or `fieldId:value` for multi-select). */
  key: string;
  fieldId: string;
  /** Display text, e.g. `Status: Open` or `Created: 2024-01-01 → 2024-03-31`. */
  label: string;
  /** For multi enum/relation chips, the single value this chip clears. */
  value?: string;
}
