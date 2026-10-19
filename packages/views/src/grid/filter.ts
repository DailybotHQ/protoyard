import { z } from 'zod';
import { type GridColumnDef, type GridValueType, normalize, readValue } from './columns.ts';

/**
 * Filters are data: a tree of and/or groups and conditions, stored in saved
 * views and snapshots, validated with zod and compiled to plain closures
 * (never `eval` or `new Function`).
 */

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'in',
  'between',
  'before',
  'after',
  'isEmpty',
  'isNotEmpty',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

type Scalar = string | number | boolean | null;

export interface FilterCondition {
  type: 'condition';
  field: string;
  operator: FilterOperator;
  /** eq/neq: a scalar; contains: text; in: a list; between: [low, high]; before/after: a date. */
  value?: Scalar | Scalar[];
}

export interface FilterGroup {
  type: 'group';
  op: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

/** Bounds for filters that come from snapshots or other untrusted data. */
export const FILTER_LIMITS = { depth: 6, nodes: 200 } as const;

const scalar = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

const ConditionSchema = z
  .strictObject({
    type: z.literal('condition'),
    field: z.string().min(1).max(64),
    operator: z.enum(FILTER_OPERATORS),
    value: z.union([scalar, z.array(scalar).max(100)]).optional(),
  })
  .superRefine((condition, ctx) => {
    const { operator, value } = condition;
    const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['value'], message });
    if (operator === 'isEmpty' || operator === 'isNotEmpty') {
      if (value !== undefined) fail(`${operator} takes no value`);
    } else if (operator === 'in') {
      if (!Array.isArray(value) || value.length === 0) fail('in needs a non-empty list');
    } else if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2) fail('between needs [low, high]');
    } else if (operator === 'contains') {
      if (typeof value !== 'string' || value === '') fail('contains needs text');
    } else if (operator === 'before' || operator === 'after') {
      if (typeof value !== 'string' && typeof value !== 'number') fail(`${operator} needs a date`);
    } else if (value === undefined || Array.isArray(value)) {
      fail(`${operator} needs one value`);
    }
  });

const GroupSchema: z.ZodType<FilterGroup> = z.strictObject({
  type: z.literal('group'),
  op: z.enum(['and', 'or']),
  children: z.array(z.lazy(() => FilterNodeSchema)).max(FILTER_LIMITS.nodes),
});

function measure(node: FilterNode, depth: number, stats: { nodes: number; depth: number }): void {
  stats.nodes++;
  stats.depth = Math.max(stats.depth, depth);
  if (node.type === 'group') for (const child of node.children) measure(child, depth + 1, stats);
}

/** The shape of any filter tree (structure, values and size), without knowing the columns. */
export const FilterNodeSchema: z.ZodType<FilterNode> = z
  .union([ConditionSchema, GroupSchema])
  .superRefine((node, ctx) => {
    const stats = { nodes: 0, depth: 0 };
    measure(node, 1, stats);
    if (stats.depth > FILTER_LIMITS.depth || stats.nodes > FILTER_LIMITS.nodes) {
      ctx.addIssue({
        code: 'custom',
        message: `filters are limited to ${FILTER_LIMITS.depth} levels and ${FILTER_LIMITS.nodes} nodes`,
      });
    }
  });

/** Operators that make sense for each value type (the filter builder offers these). */
export const OPERATORS_BY_TYPE: Record<GridValueType, readonly FilterOperator[]> = {
  text: ['eq', 'neq', 'contains', 'in', 'isEmpty', 'isNotEmpty'],
  enum: ['eq', 'neq', 'in', 'isEmpty', 'isNotEmpty'],
  number: ['eq', 'neq', 'in', 'between', 'isEmpty', 'isNotEmpty'],
  date: ['eq', 'neq', 'between', 'before', 'after', 'isEmpty', 'isNotEmpty'],
  boolean: ['eq', 'neq', 'isEmpty', 'isNotEmpty'],
};

function valueIssue(column: GridColumnDef<unknown>, value: Scalar): string | null {
  if (value === null) return null;
  if (column.type === 'number' && typeof value !== 'number')
    return `${column.header} compares numbers`;
  if (column.type === 'date' && normalize(value as string | number, 'date') === null) {
    return `${column.header} needs a valid date`;
  }
  if (column.type === 'boolean' && typeof value !== 'boolean')
    return `${column.header} is true or false`;
  if (column.type === 'enum' && column.options && !column.options.includes(String(value))) {
    return `${String(value)} is not an option of ${column.header}`;
  }
  return null;
}

/** `FilterNodeSchema` plus checks against the grid's columns: known fields, fitting operators and values. */
export function filterSchemaFor<T>(columns: readonly GridColumnDef<T>[]): z.ZodType<FilterNode> {
  const byKey = new Map(columns.map((column) => [column.key, column as GridColumnDef<unknown>]));
  return FilterNodeSchema.superRefine((root, ctx) => {
    const visit = (node: FilterNode, path: (string | number)[]) => {
      if (node.type === 'group') {
        node.children.forEach((child, i) => {
          visit(child, [...path, 'children', i]);
        });
        return;
      }
      const column = byKey.get(node.field);
      if (!column) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'field'],
          message: `unknown field "${node.field}"`,
        });
        return;
      }
      if (!OPERATORS_BY_TYPE[column.type].includes(node.operator)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'operator'],
          message: `${node.operator} does not apply to ${column.header} (${column.type})`,
        });
        return;
      }
      const values =
        node.value === undefined ? [] : Array.isArray(node.value) ? node.value : [node.value];
      for (const value of values) {
        const issue = valueIssue(column, value);
        if (issue) ctx.addIssue({ code: 'custom', path: [...path, 'value'], message: issue });
      }
    };
    visit(root, []);
  });
}

type Predicate<T> = (row: T) => boolean;

function textKey(value: string | number | null, type: GridValueType): string | number | null {
  return type === 'text' && typeof value === 'string' ? value.toLowerCase() : value;
}

function compileCondition<T>(condition: FilterCondition, column: GridColumnDef<T>): Predicate<T> {
  const { type } = column;
  const read = (row: T) => textKey(normalize(readValue(row, column), type), type);
  const target = (value: Scalar) => textKey(normalize(value, type), type);
  const value = condition.value;
  switch (condition.operator) {
    case 'isEmpty':
      return (row) => read(row) === null;
    case 'isNotEmpty':
      return (row) => read(row) !== null;
    case 'eq':
    case 'neq': {
      const expected = target(value as Scalar);
      const negate = condition.operator === 'neq';
      return (row) => (read(row) === expected) !== negate;
    }
    case 'contains': {
      const needle = String(value).toLowerCase();
      return (row) => {
        const v = read(row);
        return v !== null && String(v).toLowerCase().includes(needle);
      };
    }
    case 'in': {
      const allowed = new Set((value as Scalar[]).map(target));
      return (row) => allowed.has(read(row));
    }
    case 'between': {
      const [low, high] = (value as Scalar[]).map(target) as [number, number];
      return (row) => {
        const v = read(row);
        return typeof v === 'number' && v >= low && v <= high;
      };
    }
    case 'before':
    case 'after': {
      const bound = target(value as Scalar) as number;
      const before = condition.operator === 'before';
      return (row) => {
        const v = read(row);
        return typeof v === 'number' && (before ? v < bound : v > bound);
      };
    }
  }
}

function compileNode<T>(
  node: FilterNode,
  byKey: ReadonlyMap<string, GridColumnDef<T>>
): Predicate<T> {
  if (node.type === 'condition')
    return compileCondition(node, byKey.get(node.field) as GridColumnDef<T>);
  const children = node.children.map((child) => compileNode(child, byKey));
  if (children.length === 0) return () => true;
  return node.op === 'and'
    ? (row) => children.every((test) => test(row))
    : (row) => children.some((test) => test(row));
}

/**
 * Validates `ast` against the columns (throws a `ZodError` for unknown fields,
 * operators that do not fit the column, or bad values) and returns a
 * predicate. Text comparisons ignore case; empty values never match a
 * comparison except `neq` and `isEmpty`; an empty group matches every row.
 */
export function compileFilter<T>(ast: unknown, columns: readonly GridColumnDef<T>[]): Predicate<T> {
  const node = filterSchemaFor(columns).parse(ast);
  return compileNode(node, new Map(columns.map((column) => [column.key, column])));
}
