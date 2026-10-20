import { z } from 'zod';

/**
 * Validation tasks (ADR-031): an optional `validation.tasks` block that turns
 * an exploration into a small usability session ("book a class for Friday").
 * A task succeeds on a route match and/or one restricted data predicate:
 * an entity, a field, an operator from a closed list and a literal value.
 * There is no expression language and nothing is ever evaluated as code, so
 * a blueprint from a link stays data.
 */

export const VALIDATION_DATA_OPS = ['eq', 'contains', 'count>='] as const;
export type ValidationDataOp = (typeof VALIDATION_DATA_OPS)[number];
export const VALIDATION_MAX_TASKS = 20;

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FIELD_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/** An app route as the hash router sees it: no query, fragment, spaces or `..`. */
const ROUTE_PATTERN = /^\/(?:[A-Za-z0-9._~:@-]+(?:\/[A-Za-z0-9._~:@-]+)*\/?)?$/;

const entityName = z
  .string()
  .regex(NAME_PATTERN, { message: 'entity must be a kebab-case entity name' });
const fieldName = z
  .string()
  .regex(FIELD_PATTERN, { message: 'field must be a lowerCamelCase field name' });
const Scalar = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);

export const ValidationRouteSchema = z.strictObject({
  path: z
    .string()
    .max(200)
    .regex(ROUTE_PATTERN, {
      message: 'path must be an app route such as /bookings or /bookings/new',
    })
    .refine((path) => !path.split('/').some((segment) => segment === '.' || segment === '..'), {
      message: 'path must not contain . or .. segments',
    }),
  /** `exact` (default) or `prefix`: `/bookings` also matches `/bookings/b-1`. */
  match: z.enum(['exact', 'prefix']).default('exact'),
});

export const ValidationDataSchema = z.discriminatedUnion('op', [
  /** Some row of `entity` has `field` equal to `value` (an array field: contains it). */
  z.strictObject({ op: z.literal('eq'), entity: entityName, field: fieldName, value: Scalar }),
  /** Some row of `entity` has a text `field` containing `value`, ignoring case. */
  z.strictObject({
    op: z.literal('contains'),
    entity: entityName,
    field: fieldName,
    value: z.string().min(1).max(200),
  }),
  /**
   * `entity` has at least `value` rows: more than when the task started
   * (`from: "task-start"`, the default: "create a booking" means +1), or in
   * total (`from: "zero"`).
   */
  z.strictObject({
    op: z.literal('count>='),
    entity: entityName,
    value: z.number().int().min(0).max(100_000),
    from: z.enum(['task-start', 'zero']).default('task-start'),
  }),
]);

export const ValidationSuccessSchema = z
  .strictObject({
    route: ValidationRouteSchema.optional(),
    data: ValidationDataSchema.optional(),
  })
  .refine((success) => success.route !== undefined || success.data !== undefined, {
    message: 'success needs a route, a data predicate, or both',
  });

export const ValidationTaskSchema = z.strictObject({
  id: z.string().regex(NAME_PATTERN, { message: 'task id must be lowercase kebab-case' }).max(48),
  /** What the participant is asked to do, shown verbatim (plain text, never HTML). */
  prompt: z.string().trim().min(1).max(280),
  /** Seconds before the task counts as timed out (10 s to 1 h). */
  timeLimitSeconds: z.number().int().min(10).max(3600).optional(),
  /** Both parts must hold when both are given. */
  success: ValidationSuccessSchema,
});

export const ValidationSchema = z.strictObject({
  tasks: z
    .array(ValidationTaskSchema)
    .min(1, { message: 'validation needs at least one task' })
    .max(VALIDATION_MAX_TASKS),
});

export type ValidationRoute = z.output<typeof ValidationRouteSchema>;
export type ValidationData = z.output<typeof ValidationDataSchema>;
export type ValidationSuccess = z.output<typeof ValidationSuccessSchema>;
export type ValidationTask = z.output<typeof ValidationTaskSchema>;
export type BlueprintValidation = z.output<typeof ValidationSchema>;

/** Field kinds `contains` can read: text values, or a string array for `tags`. */
export const CONTAINS_FIELD_KINDS: ReadonlySet<string> = new Set([
  'text',
  'longText',
  'email',
  'url',
  'phone',
  'enum',
  'tags',
]);
/** Field kinds `eq` compares to a number, a boolean, or a string. */
const NUMBER_KINDS = new Set(['number', 'integer', 'money']);
const BOOLEAN_KINDS = new Set(['boolean']);
const UNCOMPARABLE_KINDS = new Set(['json', 'file', 'geo']);

type IssuePath = (string | number)[];

/**
 * Cross-reference checks the zod shape cannot express: unique task ids,
 * entities and fields that exist, and values whose type fits the field.
 */
export function validationIssues(
  validation: BlueprintValidation,
  entities: ReadonlyMap<string, { fields: readonly { name: string; kind: string }[] }>,
  add: (path: IssuePath, message: string) => void
): void {
  const seen = new Map<string, number>();
  validation.tasks.forEach((task, i) => {
    const at: IssuePath = ['validation', 'tasks', i];
    const first = seen.get(task.id);
    if (first !== undefined)
      add([...at, 'id'], `duplicate task id "${task.id}" (first at tasks.${first})`);
    else seen.set(task.id, i);

    const data = task.success.data;
    if (!data) return;
    const dataAt: IssuePath = [...at, 'success', 'data'];
    const entity = entities.get(data.entity);
    if (!entity) {
      add([...dataAt, 'entity'], `unknown entity "${data.entity}"`);
      return;
    }
    if (data.op === 'count>=') return;
    const field = entity.fields.find((candidate) => candidate.name === data.field);
    if (!field) {
      add([...dataAt, 'field'], `entity "${data.entity}" has no field "${data.field}"`);
      return;
    }
    if (data.op === 'contains') {
      if (!CONTAINS_FIELD_KINDS.has(field.kind))
        add(
          [...dataAt, 'field'],
          `contains needs a text, enum or tags field; "${data.field}" is ${field.kind}`
        );
      return;
    }
    if (UNCOMPARABLE_KINDS.has(field.kind)) {
      add([...dataAt, 'field'], `eq cannot compare a ${field.kind} field`);
    } else if (data.value !== null) {
      const expected = NUMBER_KINDS.has(field.kind)
        ? 'number'
        : BOOLEAN_KINDS.has(field.kind)
          ? 'boolean'
          : 'string';
      if (typeof data.value !== expected)
        add([...dataAt, 'value'], `"${data.field}" is ${field.kind}; value must be a ${expected}`);
    }
  });
}

/** What the evaluator looks at: plain data, no runtime handles. */
export interface ValidationObservation {
  /** The current app route (`/bookings/b-1`); a query or fragment is ignored. */
  route: string;
  /** Current rows per entity name. Entities not listed count as empty. */
  rows: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
  /** Row counts per entity when the task started (for `count>=` from `task-start`). */
  baseline?: Readonly<Record<string, number>>;
}

export interface ValidationOutcome {
  met: boolean;
  /** null when the condition has no route part. */
  route: boolean | null;
  /** null when the condition has no data part. */
  data: boolean | null;
}

function normalizeRoute(route: string): string {
  const path = route.replace(/^#/, '').split(/[?#]/)[0] ?? '';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

export function routeMatches(condition: ValidationRoute, route: string): boolean {
  const current = normalizeRoute(route);
  const wanted = normalizeRoute(condition.path);
  if (condition.match === 'exact') return current === wanted;
  return wanted === '/' || current === wanted || current.startsWith(`${wanted}/`);
}

function valueContains(value: unknown, needle: string): boolean {
  const wanted = needle.toLowerCase();
  if (typeof value === 'string') return value.toLowerCase().includes(wanted);
  if (Array.isArray(value))
    return value.some((item) => typeof item === 'string' && item.toLowerCase().includes(wanted));
  return false;
}

function valueEquals(value: unknown, expected: string | number | boolean | null): boolean {
  if (Array.isArray(value)) return value.some((item) => item === expected);
  if (expected === null) return value === null || value === undefined;
  return value === expected;
}

export function dataHolds(condition: ValidationData, observation: ValidationObservation): boolean {
  const rows = observation.rows[condition.entity] ?? [];
  switch (condition.op) {
    case 'eq':
      return rows.some((row) => valueEquals(row[condition.field], condition.value));
    case 'contains':
      return rows.some((row) => valueContains(row[condition.field], condition.value));
    case 'count>=': {
      const base = condition.from === 'zero' ? 0 : (observation.baseline?.[condition.entity] ?? 0);
      return rows.length >= base + condition.value;
    }
  }
}

/**
 * Pure and deterministic: the same success condition and observation always
 * give the same outcome. No clock, no randomness, no code from the blueprint.
 */
export function evaluateValidationSuccess(
  success: ValidationSuccess,
  observation: ValidationObservation
): ValidationOutcome {
  const route = success.route ? routeMatches(success.route, observation.route) : null;
  const data = success.data ? dataHolds(success.data, observation) : null;
  return {
    met: route !== false && data !== false && (route !== null || data !== null),
    route,
    data,
  };
}

/** Row counts per entity, to record as the `baseline` when a task starts. */
export function validationBaseline(rows: ValidationObservation['rows']): Record<string, number> {
  return Object.fromEntries(Object.entries(rows).map(([entity, list]) => [entity, list.length]));
}
