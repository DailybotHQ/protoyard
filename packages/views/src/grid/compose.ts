import type { GridColumnDef } from './columns.ts';
import {
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  FilterNodeSchema,
  type FilterOperator,
  filterSchemaFor,
} from './filter.ts';

/**
 * Filter composition on top of the filter AST: canonical form and
 * serialization (equal filters serialize to the same text whatever order they
 * were built in), facets (OR within a field, AND across fields: the
 * "Status is any of Open or Pending" chips of a toolbar), human-readable chips,
 * and removal by path. Every helper is pure and returns new data; the view
 * state stays plain and app-owned.
 */

type Scalar = string | number | boolean | null;

/** Upper bound on serialized filter text accepted by `parseSerializedFilter`. */
export const SERIALIZED_FILTER_MAX_BYTES = 32 * 1024;

const typeRank = (value: Scalar) =>
  value === null ? 0 : typeof value === 'boolean' ? 1 : typeof value === 'number' ? 2 : 3;

/** A total, locale-free order on scalars (null < booleans < numbers < strings). */
export function compareScalars(a: Scalar, b: Scalar): number {
  const rank = typeRank(a) - typeRank(b);
  if (rank !== 0) return rank;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly Scalar[]): Scalar[] {
  const sorted = [...values].sort(compareScalars);
  return sorted.filter(
    (value, i) => i === 0 || compareScalars(value, sorted[i - 1] as Scalar) !== 0
  );
}

/** Canonical JSON for a normalized node: fixed key order, no whitespace. */
function render(node: FilterNode): string {
  if (node.type === 'group') {
    return `{"type":"group","op":${JSON.stringify(node.op)},"children":[${node.children.map(render).join(',')}]}`;
  }
  const value = node.value === undefined ? '' : `,"value":${JSON.stringify(node.value)}`;
  return `{"type":"condition","field":${JSON.stringify(node.field)},"operator":${JSON.stringify(node.operator)}${value}}`;
}

/**
 * The canonical form of a filter, or null when it matches every row (as an
 * empty group does): groups of the same operator are flattened into their
 * parent, empty groups dropped from `and` (an `or` holding one matches all),
 * single-child groups unwrapped, `in` lists deduplicated and sorted, and
 * group children sorted. Matching is unchanged; only the shape is.
 */
export function normalizeFilter(node: FilterNode | null): FilterNode | null {
  if (!node) return null;
  if (node.type === 'condition') {
    return node.operator === 'in' && Array.isArray(node.value)
      ? { ...node, value: uniqueSorted(node.value) }
      : node;
  }
  const children: FilterNode[] = [];
  for (const child of node.children) {
    const normal = normalizeFilter(child);
    // null matches every row: neutral inside `and`, and makes an `or` match every row.
    if (!normal) {
      if (node.op === 'or') return null;
      continue;
    }
    if (normal.type === 'group' && normal.op === node.op) children.push(...normal.children);
    else children.push(normal);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0] as FilterNode;
  const keyed = children.map((child) => ({ child, key: render(child) }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const unique = keyed.filter((entry, i) => i === 0 || entry.key !== keyed[i - 1]?.key);
  if (unique.length === 1) return unique[0]?.child as FilterNode;
  return { type: 'group', op: node.op, children: unique.map((entry) => entry.child) };
}

/**
 * Structural cleanup that keeps the author's order: empty groups are dropped
 * from `and` (an `or` holding one matches every row, so it becomes null) and
 * single-child groups unwrapped. Returns null when nothing filters. Use it
 * after an edit; use `normalizeFilter` to compare or serialize.
 */
export function tidyFilter(node: FilterNode | null): FilterNode | null {
  if (!node || node.type === 'condition') return node;
  const kept = node.children.map(tidyFilter);
  // An empty group matches every row, so an `or` holding one matches every row.
  if (node.op === 'or' && kept.includes(null)) return null;
  const children = kept.filter((child): child is FilterNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0] as FilterNode;
  return { ...node, children };
}

/** Deterministic text for a filter: equal filters give equal text. `""` means no filter. */
export function serializeFilter(node: FilterNode | null): string {
  const normal = normalizeFilter(node);
  return normal ? render(normal) : '';
}

/** Whether two filters match the same rows by construction (same canonical form). */
export function filtersEqual(a: FilterNode | null, b: FilterNode | null): boolean {
  return serializeFilter(a) === serializeFilter(b);
}

/**
 * Reads serialized filter text (from a URL, storage or a snapshot) as
 * untrusted input: bounded size, valid JSON, the bounded filter schema and,
 * with `columns`, known fields and fitting operators. Returns the normalized
 * filter, or null for `""`. Throws an `Error` with a readable message.
 */
export function parseSerializedFilter<T>(
  text: string,
  columns?: readonly GridColumnDef<T>[]
): FilterNode | null {
  if (text === '') return null;
  if (new TextEncoder().encode(text).byteLength > SERIALIZED_FILTER_MAX_BYTES) {
    throw new Error(`A serialized filter is limited to ${SERIALIZED_FILTER_MAX_BYTES} bytes.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The serialized filter is not valid JSON.');
  }
  const schema = columns ? filterSchemaFor(columns) : FilterNodeSchema;
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `The serialized filter is not valid: ${result.error.issues[0]?.message ?? 'unknown issue'}.`
    );
  }
  return normalizeFilter(result.data);
}

// ── facets ──────────────────────────────────────────────────────────────

/** Selected values per field: OR within a field, AND across fields. */
export type FilterFacets = Readonly<Record<string, readonly Scalar[]>>;

/** The top-level conditions of a filter (the children of a root `and`, or the root itself). */
function topLevel(node: FilterNode | null): FilterNode[] {
  if (!node) return [];
  if (node.type === 'group' && node.op === 'and') return node.children;
  return [node];
}

function facetValues(node: FilterNode): Scalar[] | null {
  if (node.type !== 'condition') return null;
  if (node.operator === 'eq' && !Array.isArray(node.value) && node.value !== undefined) {
    return [node.value];
  }
  if (node.operator === 'in' && Array.isArray(node.value)) return node.value;
  return null;
}

/**
 * Splits a filter into facets (top-level `eq`/`in` conditions, one per field)
 * and the rest (everything else, kept as-is). A field with two facet-like
 * conditions keeps the second in `rest`, since AND-ing them is not a facet.
 */
export function facetsFromFilter(node: FilterNode | null): {
  facets: Record<string, Scalar[]>;
  rest: FilterNode[];
} {
  const facets: Record<string, Scalar[]> = {};
  const rest: FilterNode[] = [];
  for (const child of topLevel(node)) {
    const values = facetValues(child);
    const field = child.type === 'condition' ? child.field : '';
    if (values && !Object.hasOwn(facets, field)) facets[field] = uniqueSorted(values);
    else rest.push(child);
  }
  return { facets, rest };
}

/**
 * Builds the filter for `facets` plus `rest`: one condition per field with
 * values (`eq` for one value, a sorted `in` for several), AND-ed with `rest`.
 * Fields without values are left out; `rest` keeps its order. Returns null
 * when nothing filters.
 */
export function filterFromFacets(
  facets: FilterFacets,
  rest: readonly FilterNode[] = []
): FilterNode | null {
  const conditions: FilterCondition[] = Object.keys(facets)
    .sort()
    .flatMap((field) => {
      const values = uniqueSorted(facets[field] ?? []);
      if (values.length === 0) return [];
      return [
        values.length === 1
          ? { type: 'condition', field, operator: 'eq', value: values[0] as Scalar }
          : { type: 'condition', field, operator: 'in', value: values },
      ];
    });
  return tidyFilter({ type: 'group', op: 'and', children: [...conditions, ...rest] });
}

/** Replaces the values of one facet (an empty list removes it); other conditions stay. */
export function setFacet(
  node: FilterNode | null,
  field: string,
  values: readonly Scalar[]
): FilterNode | null {
  const { facets, rest } = facetsFromFilter(node);
  return filterFromFacets({ ...facets, [field]: [...values] }, rest);
}

/** Adds `value` to a facet, or removes it when already selected. */
export function toggleFacetValue(
  node: FilterNode | null,
  field: string,
  value: Scalar
): FilterNode | null {
  const current = facetsFromFilter(node).facets[field] ?? [];
  const selected = current.some((entry) => compareScalars(entry, value) === 0);
  return setFacet(
    node,
    field,
    selected ? current.filter((entry) => compareScalars(entry, value) !== 0) : [...current, value]
  );
}

// ── chips ───────────────────────────────────────────────────────────────

export const FILTER_OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  in: 'is any of',
  between: 'is between',
  before: 'is before',
  after: 'is after',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
};

export interface FilterChip {
  /** Stable within one filter: the path joined with dots (`""` for a root condition). */
  id: string;
  /** Child indexes from the root, for `removeFilterAt`. */
  path: number[];
  /** The field, or null for a nested group. */
  field: string | null;
  /** "Stage", or "Any of" / "All of" for a nested group. */
  label: string;
  /** "is any of", "contains"… (empty for a group). */
  operator: string;
  /** "Lead or Won", "3 conditions"… */
  value: string;
  /** The whole sentence, for an accessible name: "Stage is any of Lead or Won". */
  text: string;
}

/** "A, B or C" — the last pair joined with "or" so lists read as alternatives. */
export function describeValues(values: readonly string[], joiner = 'or'): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} ${joiner} ${values[values.length - 1]}`;
}

export interface DescribeFilterOptions {
  /** Display text for a value (default: `String(value)`; booleans "Yes"/"No"). */
  formatValue?: (field: string, value: Scalar) => string;
}

function conditionChip<T>(
  condition: FilterCondition,
  path: number[],
  columns: readonly GridColumnDef<T>[],
  options: DescribeFilterOptions
): FilterChip {
  const header =
    columns.find((column) => column.key === condition.field)?.header ?? condition.field;
  const show = (value: Scalar) =>
    options.formatValue?.(condition.field, value) ??
    (typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : value === null
        ? '(empty)'
        : String(value));
  const operator = FILTER_OPERATOR_LABELS[condition.operator];
  const raw = condition.value;
  const value =
    raw === undefined
      ? ''
      : Array.isArray(raw)
        ? describeValues(raw.map(show), condition.operator === 'between' ? 'and' : 'or')
        : show(raw);
  return {
    id: path.join('.'),
    path,
    field: condition.field,
    label: header,
    operator,
    value,
    text: [header, operator, value].filter(Boolean).join(' '),
  };
}

/**
 * One chip per top-level condition (and one per nested group, summarized), in
 * the filter's own order, so each can be shown and removed on its own.
 */
export function describeFilter<T>(
  node: FilterNode | null,
  columns: readonly GridColumnDef<T>[],
  options: DescribeFilterOptions = {}
): FilterChip[] {
  if (!node) return [];
  const isRootAnd = node.type === 'group' && node.op === 'and';
  const entries = isRootAnd
    ? (node as FilterGroup).children.map((child, i) => ({ child, path: [i] }))
    : [{ child: node, path: [] as number[] }];
  return entries.map(({ child, path }) => {
    if (child.type === 'condition') return conditionChip(child, path, columns, options);
    const count = child.children.length;
    const label = child.op === 'or' ? 'Any of' : 'All of';
    const value = `${count} ${count === 1 ? 'condition' : 'conditions'}`;
    return {
      id: path.join('.'),
      path,
      field: null,
      label,
      operator: '',
      value,
      text: `${label} ${value}`,
    };
  });
}

/**
 * Removes the node at `path` (child indexes from the root; `[]` removes all)
 * and returns the tidied remainder (order kept), or null when nothing is left.
 */
export function removeFilterAt(
  node: FilterNode | null,
  path: readonly number[]
): FilterNode | null {
  if (!node || path.length === 0) return null;
  const strip = (current: FilterNode, at: readonly number[]): FilterNode | null => {
    if (current.type !== 'group') return current;
    const [head, ...rest] = at as [number, ...number[]];
    const children = current.children.flatMap((child, i) => {
      if (i !== head) return [child];
      if (rest.length === 0) return [];
      const kept = strip(child, rest);
      // A group emptied by this removal goes too: kept, it would match every row.
      return kept && !(kept.type === 'group' && kept.children.length === 0) ? [kept] : [];
    });
    return { ...current, children };
  };
  return tidyFilter(strip(node, path));
}
