import {
  type FilterCondition,
  type FilterGroup,
  type FilterOperator,
  filterSchemaFor,
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
  type PropertyCatalog,
  type PropertyType,
} from '@protoyard/analytics';

/*
 * The pure side of the filter builder: the property catalog a prototype
 * offers, operators per type, turning form text into typed values, a
 * readable sentence for chips and saved segments, and validation that maps
 * zod issues to field errors keyed by path.
 */

export interface FilterProperty {
  /** Dotted path into the row: `type`, `properties.plan`. */
  path: string;
  label: string;
  type: PropertyType;
  /** Known values for string properties (shown as choices). */
  options?: readonly { value: string; label: string }[];
}

export const catalogOf = (properties: readonly FilterProperty[]): PropertyCatalog =>
  Object.fromEntries(properties.map((p) => [p.path, p.type]));

export const operatorsFor = (property: FilterProperty | undefined): readonly FilterOperator[] =>
  property ? OPERATORS_BY_TYPE[property.type] : [];

export const takesValue = (operator: FilterOperator) =>
  operator !== 'is_set' && operator !== 'is_not_set';
export const takesList = (operator: FilterOperator) => operator === 'in' || operator === 'not_in';

/** A fresh condition on a property, with its first operator and an empty value. */
export function newCondition(property: FilterProperty): FilterCondition {
  const operator = OPERATORS_BY_TYPE[property.type][0] as FilterOperator;
  return { property: property.path, operator, value: property.type === 'boolean' ? true : null };
}

/** One form field's text as the typed value the property needs (NaN-free; '' becomes null). */
export function parseScalar(text: string, type: PropertyType): string | number | boolean | null {
  const t = text.trim();
  if (t === '') return null;
  if (type === 'number') {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') return t === 'true';
  return t;
}

/** Reconciles a condition after its property or operator changed, keeping the value when it still fits. */
export function adjustCondition(
  condition: FilterCondition,
  property: FilterProperty
): FilterCondition {
  const operators = OPERATORS_BY_TYPE[property.type];
  const operator = operators.includes(condition.operator)
    ? condition.operator
    : (operators[0] as FilterOperator);
  let value = condition.value ?? null;
  if (!takesValue(operator)) value = null;
  else if (takesList(operator))
    value = Array.isArray(value) ? value : value === null ? [] : [value];
  else if (operator === 'between')
    value = Array.isArray(value) && value.length === 2 ? value : ([null, null] as never);
  else if (Array.isArray(value)) value = (value[0] as never) ?? null;
  if (property.type === 'boolean' && takesValue(operator) && typeof value !== 'boolean')
    value = true;
  return { property: property.path, operator, value };
}

const show = (v: unknown, property: FilterProperty | undefined) =>
  property?.options?.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : String(v));

/** "Plan is Pro and (Country is any of NZ, CA or Seats at least 5)". */
export function describeFilter(
  group: FilterGroup,
  properties: readonly FilterProperty[],
  nested = false
): string {
  const byPath = new Map(properties.map((p) => [p.path, p]));
  const parts = group.conditions.map((c) => {
    if ('combinator' in c) return describeFilter(c, properties, true);
    const property = byPath.get(c.property);
    const label = property?.label ?? c.property;
    const op = OPERATOR_LABELS[c.operator];
    if (!takesValue(c.operator)) return `${label} ${op}`;
    const value = Array.isArray(c.value)
      ? c.operator === 'between'
        ? c.value.map((v) => show(v, property)).join(' and ')
        : c.value.map((v) => show(v, property)).join(', ')
      : show(c.value, property);
    return `${label} ${op} ${value}`;
  });
  if (parts.length === 0) return nested ? '' : 'Everyone';
  const text = parts.filter(Boolean).join(` ${group.combinator} `);
  return nested && parts.length > 1 ? `(${text})` : text;
}

export interface FilterValidation {
  ok: boolean;
  data?: FilterGroup;
  /** Messages keyed by dotted path, e.g. `conditions.0.value`. */
  errors: Record<string, string>;
}

/** Validates against the catalog; the first message per field wins. */
export function validateFilter(
  group: FilterGroup,
  properties: readonly FilterProperty[]
): FilterValidation {
  const result = filterSchemaFor(catalogOf(properties)).safeParse(group);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Error text for a failed save: field errors (`issues`) or a sentence for permission and other failures. */
export function saveErrorOf(error: unknown): { field?: Record<string, string>; message: string } {
  const e = error as {
    name?: string;
    message?: string;
    issues?: unknown;
    capability?: string;
  } | null;
  if (e && typeof e.issues === 'object' && e.issues !== null) {
    return { field: e.issues as Record<string, string>, message: 'Fix the highlighted field' };
  }
  if (e?.name === 'PermissionDeniedError') return { message: "Your role can't save segments" };
  if (e?.name === 'SimulatedServiceError')
    return { message: e.message ?? 'The request failed; try again' };
  return { message: e?.message || 'Could not save the segment' };
}
