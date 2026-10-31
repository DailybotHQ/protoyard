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

/*
 * The bridge to Texuli's filter builder (`@texuli/data/filter-builder`, G49):
 * the property catalog becomes builder fields with a per-type operator list,
 * Protoyard operators the builder lacks become catalog operators, and the two
 * filter models convert both ways. The applied filter stays Protoyard's
 * `FilterGroup`, validated by `validateFilter` and compiled by
 * `@protoyard/analytics`.
 */

type Cell = string | number | boolean | Date | null | undefined;
type TexuliValue = string | number | boolean | null | (string | number | boolean | null)[];

/** A Texuli builder condition or group (the grid engine's filter AST). */
export type BuilderNode =
  | { type: 'condition'; field: string; operator: string; value?: TexuliValue }
  | BuilderGroup;
export interface BuilderGroup {
  type: 'group';
  op: 'and' | 'or';
  children: BuilderNode[];
}

/** A builder field (`FilterField` of `@texuli/data/filter-builder`). */
export interface BuilderField {
  key: string;
  header: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'enum';
  options?: readonly string[];
  operators: readonly string[];
}

/** A builder catalog operator (`FilterOperatorDef` of `@texuli/data/filter-builder`). */
export interface BuilderOperator {
  id: string;
  label: string;
  editor: 'none' | 'text' | 'number' | 'date' | 'boolean' | 'option' | 'options' | 'range';
  types?: readonly BuilderField['type'][];
  test(cell: Cell, value: TexuliValue | undefined): boolean;
}

const lowerText = (v: unknown) => (v === null || v === undefined ? '' : String(v).toLowerCase());
const asNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const asTime = (v: unknown) =>
  v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v));
const compareWith =
  (read: (v: unknown) => number, ok: (d: number) => boolean) => (cell: Cell, value: unknown) => {
    const a = read(cell);
    const b = read(value);
    return Number.isFinite(a) && Number.isFinite(b) && ok(a - b);
  };

/** Protoyard operators Texuli's builder does not ship, as catalog operators. */
export const BUILDER_OPERATORS: readonly BuilderOperator[] = [
  {
    id: 'gt',
    label: OPERATOR_LABELS.gt,
    editor: 'number',
    types: ['number'],
    test: compareWith(asNumber, (d) => d > 0),
  },
  {
    id: 'gte',
    label: OPERATOR_LABELS.gte,
    editor: 'number',
    types: ['number'],
    test: compareWith(asNumber, (d) => d >= 0),
  },
  {
    id: 'lt',
    label: OPERATOR_LABELS.lt,
    editor: 'number',
    types: ['number'],
    test: compareWith(asNumber, (d) => d < 0),
  },
  {
    id: 'lte',
    label: OPERATOR_LABELS.lte,
    editor: 'number',
    types: ['number'],
    test: compareWith(asNumber, (d) => d <= 0),
  },
  {
    id: 'onOrAfter',
    label: 'on or after',
    editor: 'date',
    types: ['date'],
    test: compareWith(asTime, (d) => d >= 0),
  },
  {
    id: 'onOrBefore',
    label: 'on or before',
    editor: 'date',
    types: ['date'],
    test: compareWith(asTime, (d) => d <= 0),
  },
  {
    id: 'containsText',
    label: OPERATOR_LABELS.contains,
    editor: 'text',
    types: ['enum'],
    test: (cell, value) => cell != null && lowerText(cell).includes(lowerText(value)),
  },
  {
    id: 'notContains',
    label: OPERATOR_LABELS.not_contains,
    editor: 'text',
    types: ['text', 'enum'],
    test: (cell, value) => !lowerText(cell).includes(lowerText(value)),
  },
  {
    id: 'startsWith',
    label: OPERATOR_LABELS.starts_with,
    editor: 'text',
    types: ['text', 'enum'],
    test: (cell, value) => cell != null && lowerText(cell).startsWith(lowerText(value)),
  },
  {
    id: 'notIn',
    label: OPERATOR_LABELS.not_in,
    editor: 'options',
    types: ['text', 'enum', 'number'],
    test: (cell, value) => !(Array.isArray(value) && value.some((v) => v === cell)),
  },
];

/** Protoyard's operator → the builder's id, per property type (dates and option lists differ). */
function builderOperator(operator: FilterOperator, property: FilterProperty | undefined): string {
  const date = property?.type === 'date';
  const enumLike = property?.type === 'string' && Boolean(property.options?.length);
  switch (operator) {
    case 'is_set':
      return 'isNotEmpty';
    case 'is_not_set':
      return 'isEmpty';
    case 'gt':
      return date ? 'after' : 'gt';
    case 'lt':
      return date ? 'before' : 'lt';
    case 'gte':
      return date ? 'onOrAfter' : 'gte';
    case 'lte':
      return date ? 'onOrBefore' : 'lte';
    case 'contains':
      return enumLike ? 'containsText' : 'contains';
    case 'not_contains':
      return 'notContains';
    case 'starts_with':
      return 'startsWith';
    case 'not_in':
      return 'notIn';
    default:
      return operator;
  }
}

const FROM_BUILDER: Record<string, FilterOperator> = {
  isNotEmpty: 'is_set',
  isEmpty: 'is_not_set',
  after: 'gt',
  before: 'lt',
  onOrAfter: 'gte',
  onOrBefore: 'lte',
  containsText: 'contains',
  notContains: 'not_contains',
  startsWith: 'starts_with',
  notIn: 'not_in',
};

/** Labels for the builder's built-in operators, worded like `OPERATOR_LABELS`. */
export const BUILDER_OPERATOR_LABELS = {
  eq: OPERATOR_LABELS.eq,
  neq: OPERATOR_LABELS.neq,
  contains: OPERATOR_LABELS.contains,
  in: OPERATOR_LABELS.in,
  between: OPERATOR_LABELS.between,
  isEmpty: OPERATOR_LABELS.is_not_set,
  isNotEmpty: OPERATOR_LABELS.is_set,
  before: 'is before',
  after: 'is after',
} as const;

/**
 * Builder enum options are plain strings it also shows, so an option-backed
 * property lists its labels and the bridge maps them back to values. Labels
 * that repeat would be ambiguous, so such a property shows its values.
 */
function optionMap(
  property: FilterProperty
): { toShown: Map<string, string>; toValue: Map<string, string> } | null {
  const options = property.options ?? [];
  if (options.length === 0 || new Set(options.map((o) => o.label)).size !== options.length)
    return null;
  return {
    toShown: new Map(options.map((o) => [o.value, o.label])),
    toValue: new Map(options.map((o) => [o.label, o.value])),
  };
}

/** The builder fields for a property catalog, each offering Protoyard's operators for its type. */
export function builderFields(properties: readonly FilterProperty[]): BuilderField[] {
  return properties.map((property) => {
    const shown = optionMap(property);
    const type: BuilderField['type'] =
      property.type === 'string' ? (property.options?.length ? 'enum' : 'text') : property.type;
    return {
      key: property.path,
      header: property.label,
      type,
      ...(property.options?.length
        ? { options: property.options.map((o) => (shown ? o.label : o.value)) }
        : {}),
      operators: OPERATORS_BY_TYPE[property.type].map((op) => builderOperator(op, property)),
    };
  });
}

type Scalar = string | number | boolean | null;

function scalarTo(value: unknown, map: Map<string, string> | undefined): Scalar {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return map?.get(value) ?? value;
  return value as Scalar;
}

/** A Protoyard filter as the builder's model. */
export function toBuilderFilter(
  group: FilterGroup,
  properties: readonly FilterProperty[]
): BuilderGroup {
  const byPath = new Map(properties.map((p) => [p.path, p]));
  const convert = (node: FilterGroup): BuilderGroup => ({
    type: 'group',
    op: node.combinator,
    children: node.conditions.map((c) => {
      if ('combinator' in c) return convert(c);
      const property = byPath.get(c.property);
      const map = property ? optionMap(property)?.toShown : undefined;
      const value = Array.isArray(c.value)
        ? c.value.map((v) => scalarTo(v, map))
        : c.value === undefined || c.value === null
          ? undefined
          : scalarTo(c.value, map);
      return {
        type: 'condition',
        field: c.property,
        operator: builderOperator(c.operator, property),
        ...(value === undefined ? {} : { value }),
      };
    }),
  });
  return convert(group);
}

/** The builder's model back as a Protoyard filter (incomplete values become `null` for validation). */
export function fromBuilderFilter(
  group: BuilderGroup,
  properties: readonly FilterProperty[]
): FilterGroup {
  const byPath = new Map(properties.map((p) => [p.path, p]));
  const scalar = (v: unknown, property: FilterProperty | undefined): Scalar => {
    if (v === undefined || v === null || v === '') return null;
    const shown = property ? optionMap(property)?.toValue : undefined;
    if (typeof v === 'string') {
      const value = shown?.get(v) ?? v;
      return property && property.type !== 'string' ? parseScalar(value, property.type) : value;
    }
    return v as Scalar;
  };
  const convert = (node: BuilderGroup): FilterGroup => ({
    combinator: node.op,
    conditions: node.children.map((child) => {
      if (child.type === 'group') return convert(child);
      const property = byPath.get(child.field);
      const operator = (FROM_BUILDER[child.operator] ?? child.operator) as FilterOperator;
      const value = !takesValue(operator)
        ? null
        : Array.isArray(child.value)
          ? child.value.map((v) => scalar(v, property))
          : scalar(child.value, property);
      return { property: child.field, operator, value } as FilterCondition;
    }),
  });
  return convert(group);
}

/** "Condition 2.1" for a validation path such as `conditions.1.conditions.0.value`. */
export function conditionNameOf(path: string): string {
  const indexes = [...path.matchAll(/conditions\.(\d+)/g)].map((m) => Number(m[1]) + 1);
  return indexes.length ? `Condition ${indexes.join('.')}` : 'Filter';
}
