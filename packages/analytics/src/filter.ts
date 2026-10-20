import { z } from 'zod';

/*
 * Data-only filters and segments: a tree of conditions (property, operator,
 * value) joined by AND/OR, validated by zod, stored in Dexie like any row,
 * and compiled to a plain predicate. Nothing is evaluated as code.
 */

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'contains',
  'not_contains',
  'starts_with',
  'in',
  'not_in',
  'is_set',
  'is_not_set',
] as const;

export const FilterOperatorSchema = z.enum(FILTER_OPERATORS);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  in: 'is any of',
  not_in: 'is none of',
  is_set: 'is set',
  is_not_set: 'is not set',
};

/** Property types a filter UI offers operators for. */
export type PropertyType = 'string' | 'number' | 'boolean' | 'date';

/** Which operators make sense for each property type. */
export const OPERATORS_BY_TYPE: Record<PropertyType, readonly FilterOperator[]> = {
  string: [
    'eq',
    'neq',
    'contains',
    'not_contains',
    'starts_with',
    'in',
    'not_in',
    'is_set',
    'is_not_set',
  ],
  number: [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'in',
    'not_in',
    'is_set',
    'is_not_set',
  ],
  boolean: ['eq', 'neq', 'is_set', 'is_not_set'],
  date: ['gt', 'gte', 'lt', 'lte', 'between', 'is_set', 'is_not_set'],
};

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** A dotted path into a row: `type`, `userId`, `properties.plan`. */
const propertyPath = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,3}$/,
    'Use a property name such as plan or properties.plan'
  )
  .refine(
    (path) => path.split('.').every((s) => !FORBIDDEN_SEGMENTS.has(s)),
    'This property name is reserved'
  );

const scalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

const NO_VALUE: ReadonlySet<FilterOperator> = new Set(['is_set', 'is_not_set']);
const LIST: ReadonlySet<FilterOperator> = new Set(['in', 'not_in']);
const TEXT: ReadonlySet<FilterOperator> = new Set(['contains', 'not_contains', 'starts_with']);

export const FilterConditionSchema = z
  .strictObject({
    property: propertyPath,
    operator: FilterOperatorSchema,
    value: z.union([scalar, z.array(scalar).max(100), z.null()]).optional(),
  })
  .superRefine((condition, ctx) => {
    const { operator, value } = condition;
    const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['value'], message });
    if (NO_VALUE.has(operator)) {
      if (value !== undefined && value !== null)
        issue(`"${OPERATOR_LABELS[operator]}" takes no value`);
      return;
    }
    if (value === undefined || value === null) return issue('Enter a value');
    if (LIST.has(operator)) {
      if (!Array.isArray(value) || value.length === 0) issue('Choose at least one value');
      return;
    }
    if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2) issue('Enter a lower and an upper bound');
      return;
    }
    if (Array.isArray(value)) return issue('Enter a single value');
    if (TEXT.has(operator) && typeof value !== 'string') issue('Enter text');
  });
export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export interface FilterGroup {
  combinator: 'and' | 'or';
  conditions: (FilterCondition | FilterGroup)[];
}

/** Nesting limit keeps filters readable and bounds evaluation. */
export const MAX_FILTER_DEPTH = 4;

/** Hard bounds checked before any recursive parse (untrusted segments, snapshots). */
export const MAX_FILTER_NODES = 500;
/** Generous structural cap for `FilterGroupSchema`; `FilterSchema` applies `MAX_FILTER_DEPTH`. */
const MAX_PARSE_DEPTH = 32;

const GroupShapeSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.strictObject({
    combinator: z.enum(['and', 'or']),
    conditions: z.array(z.union([FilterConditionSchema, GroupShapeSchema])).max(50),
  })
);

/**
 * Measures untrusted input without recursion: the deepest group and the node
 * count. Stops early once `maxDepth` or `MAX_FILTER_NODES` is exceeded, so a
 * tree nested thousands of levels deep never reaches the recursive schema.
 */
export function measureFilterInput(
  input: unknown,
  maxDepth = MAX_PARSE_DEPTH
): { depth: number; nodes: number; exceeded: boolean } {
  const stack: { node: unknown; depth: number }[] = [{ node: input, depth: 1 }];
  let deepest = 0;
  let nodes = 0;
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number };
    nodes++;
    const conditions =
      typeof node === 'object' && node !== null
        ? (node as { conditions?: unknown }).conditions
        : undefined;
    if (Array.isArray(conditions)) deepest = Math.max(deepest, depth);
    if (deepest > maxDepth) return { depth: deepest, nodes, exceeded: true };
    if (!Array.isArray(conditions)) continue;
    if (nodes + stack.length + conditions.length > MAX_FILTER_NODES) {
      return { depth: deepest, nodes, exceeded: true };
    }
    for (const child of conditions) stack.push({ node: child, depth: depth + 1 });
  }
  return { depth: deepest, nodes, exceeded: false };
}

function boundedGroup(maxDepth: number, message: string): z.ZodType<FilterGroup> {
  return z
    .unknown()
    .superRefine((input, ctx) => {
      if (measureFilterInput(input, maxDepth).exceeded) ctx.addIssue({ code: 'custom', message });
    })
    .pipe(GroupShapeSchema);
}

/** Any filter tree, refused (not thrown) when deeper than 32 groups or over 500 nodes. */
export const FilterGroupSchema: z.ZodType<FilterGroup> = boundedGroup(
  MAX_PARSE_DEPTH,
  `Filters nest at most ${MAX_PARSE_DEPTH} groups deep and hold at most ${MAX_FILTER_NODES} nodes`
);

/** A filter plus its depth limit. An empty group matches every row. */
export const FilterSchema: z.ZodType<FilterGroup> = boundedGroup(
  MAX_FILTER_DEPTH,
  `Filters nest at most ${MAX_FILTER_DEPTH} groups deep`
);

/** A saved, named filter. */
export const SegmentSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name the segment').max(60),
  filter: FilterSchema,
});
export type Segment = z.infer<typeof SegmentSchema>;

/** Known properties and their types, e.g. `{ type: 'string', 'properties.plan': 'string', amount: 'number' }`. */
export type PropertyCatalog = Readonly<Record<string, PropertyType>>;

/**
 * Validates a filter against a property catalog: unknown properties and
 * operators that do not fit the property's type become field errors at the
 * condition's path (`conditions.0.property`), ready for inline display.
 */
export function filterSchemaFor(catalog: PropertyCatalog): z.ZodType<FilterGroup> {
  return FilterSchema.superRefine((group, ctx) => {
    const visit = (g: FilterGroup, path: (string | number)[]) => {
      g.conditions.forEach((c, i) => {
        const at = [...path, 'conditions', i];
        if ('combinator' in c) {
          visit(c, at);
          return;
        }
        const type = Object.hasOwn(catalog, c.property) ? catalog[c.property] : undefined;
        if (!type) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'property'],
            message: `Unknown property "${c.property}"`,
          });
          return;
        }
        if (!OPERATORS_BY_TYPE[type].includes(c.operator)) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'operator'],
            message: `"${OPERATOR_LABELS[c.operator]}" does not apply to ${type} properties`,
          });
        }
      });
    };
    visit(group, []);
  });
}

/** Reads a dotted path through own properties only. */
export function readProperty(row: unknown, path: string): unknown {
  let current: unknown = row;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment))
      return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/** Numbers compare numerically; ISO dates by time; other strings by code point. */
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    if (ISO_PREFIX.test(a) && ISO_PREFIX.test(b)) {
      const ta = Date.parse(a);
      const tb = Date.parse(b);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return null;
}

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';
const lower = (v: unknown) =>
  typeof v === 'string' ? v.toLowerCase() : String(v ?? '').toLowerCase();

function conditionPredicate(c: FilterCondition): (row: unknown) => boolean {
  const { property, operator, value } = c;
  const list = Array.isArray(value) ? value : [];
  switch (operator) {
    case 'is_set':
      return (row) => isSet(readProperty(row, property));
    case 'is_not_set':
      return (row) => !isSet(readProperty(row, property));
    case 'eq':
      return (row) => readProperty(row, property) === value;
    case 'neq':
      // A missing property is "not equal" to the value.
      return (row) => readProperty(row, property) !== value;
    case 'in':
      return (row) => list.includes(readProperty(row, property) as never);
    case 'not_in':
      return (row) => !list.includes(readProperty(row, property) as never);
    case 'contains':
      return (row) => {
        const v = readProperty(row, property);
        return isSet(v) && lower(v).includes(lower(value));
      };
    case 'not_contains':
      return (row) => !lower(readProperty(row, property)).includes(lower(value));
    case 'starts_with':
      return (row) => {
        const v = readProperty(row, property);
        return isSet(v) && lower(v).startsWith(lower(value));
      };
    case 'between': {
      const [lo, hi] = list;
      return (row) => {
        const v = readProperty(row, property);
        const a = compare(v, lo);
        const b = compare(v, hi);
        return a !== null && b !== null && a >= 0 && b <= 0;
      };
    }
    default: {
      const test = {
        gt: (d: number) => d > 0,
        gte: (d: number) => d >= 0,
        lt: (d: number) => d < 0,
        lte: (d: number) => d <= 0,
      }[operator];
      return (row) => {
        const d = compare(readProperty(row, property), value);
        return d !== null && test(d);
      };
    }
  }
}

/**
 * Compiles a validated filter into a predicate over plain rows. Parse input
 * with `FilterSchema` (or `filterSchemaFor(catalog)`) first; an empty group
 * matches everything.
 */
export function compileFilter(group: FilterGroup): (row: unknown) => boolean {
  const parts = group.conditions.map((c) =>
    'combinator' in c ? compileFilter(c) : conditionPredicate(c)
  );
  if (parts.length === 0) return () => true;
  return group.combinator === 'and'
    ? (row) => parts.every((p) => p(row))
    : (row) => parts.some((p) => p(row));
}
