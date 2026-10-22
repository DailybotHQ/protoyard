import { z } from 'zod';
import { FLOW_ID_PATTERN, FLOW_LIMITS } from './limits.ts';
import { type DataRef, DataRefSchema, describeRef, type RefScope, resolveRef } from './refs.ts';

/*
 * Conditions are a closed, data-only AST (ADR-041: rule ASTs replace
 * executable expressions). Every node type is listed here; there is no
 * expression, script or code node, and strict objects reject any extra key.
 * A `judge` node is the one place judgment enters: the pure evaluator never
 * decides it and reports it as `needs_judgment` unless the caller injects a
 * typed judge (a simulated assistant, a test double).
 */

export type Scalar = string | number | boolean | null;

export type Operand = { ref: DataRef } | { value: Scalar } | { values: Scalar[] };

export const COMPARE_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
] as const;
export type CompareOperator = (typeof COMPARE_OPERATORS)[number];

export const VALUE_TESTS = ['exists', 'missing', 'empty', 'not_empty', 'true', 'false'] as const;
export type ValueTest = (typeof VALUE_TESTS)[number];

export type Condition =
  | {
      type: 'compare';
      left: Operand;
      op: CompareOperator;
      right: Operand;
      caseSensitive?: boolean;
    }
  | { type: 'test'; subject: DataRef; test: ValueTest }
  | { type: 'all' | 'any'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | { type: 'judge'; phrase: string; judge?: string };

const ScalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

export const OperandSchema: z.ZodType<Operand> = z.union([
  z.strictObject({ ref: DataRefSchema }),
  z.strictObject({ value: ScalarSchema }),
  z.strictObject({ values: z.array(ScalarSchema).min(1).max(50) }),
]);

const ConditionShapeSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('compare'),
      left: OperandSchema,
      op: z.enum(COMPARE_OPERATORS),
      right: OperandSchema,
      caseSensitive: z.boolean().optional(),
    }),
    z.strictObject({ type: z.literal('test'), subject: DataRefSchema, test: z.enum(VALUE_TESTS) }),
    z.strictObject({
      type: z.enum(['all', 'any']),
      conditions: z.array(ConditionShapeSchema).min(1).max(16),
    }),
    z.strictObject({ type: z.literal('not'), condition: ConditionShapeSchema }),
    z.strictObject({
      type: z.literal('judge'),
      phrase: z.string().trim().min(1).max(280),
      judge: z.string().regex(FLOW_ID_PATTERN).optional(),
    }),
  ])
);

/** Depth (a leaf is 1) and node count of a condition tree. */
export function conditionStats(condition: Condition): { depth: number; nodes: number } {
  let nodes = 0;
  const visit = (node: Condition, depth: number): number => {
    nodes += 1;
    if (node.type === 'all' || node.type === 'any') {
      return Math.max(depth, ...node.conditions.map((child) => visit(child, depth + 1)));
    }
    if (node.type === 'not') return visit(node.condition, depth + 1);
    return depth;
  };
  return { depth: visit(condition, 1), nodes };
}

/** A condition within the depth and node caps. */
export const ConditionSchema: z.ZodType<Condition> = ConditionShapeSchema.superRefine(
  (condition, ctx) => {
    const { depth, nodes } = conditionStats(condition);
    if (depth > FLOW_LIMITS.maxConditionDepth) {
      ctx.addIssue({
        code: 'custom',
        message: `Conditions nest at most ${FLOW_LIMITS.maxConditionDepth} levels`,
      });
    }
    if (nodes > FLOW_LIMITS.maxConditionNodes) {
      ctx.addIssue({
        code: 'custom',
        message: `A condition holds at most ${FLOW_LIMITS.maxConditionNodes} parts`,
      });
    }
  }
);

/** Every data reference a condition reads, in document order. */
export function conditionRefs(condition: Condition): DataRef[] {
  switch (condition.type) {
    case 'compare':
      return [condition.left, condition.right].flatMap((o) => ('ref' in o ? [o.ref] : []));
    case 'test':
      return [condition.subject];
    case 'all':
    case 'any':
      return condition.conditions.flatMap(conditionRefs);
    case 'not':
      return conditionRefs(condition.condition);
    case 'judge':
      return [];
  }
}

/* ---------- evaluation ---------- */

export interface JudgeRequest {
  phrase: string;
  judge: string;
  scope: RefScope;
}

/**
 * Decides a `judge` node: `true` or `false`, or `null` to leave it undecided.
 * Must be pure and deterministic for a given request (a simulation, never a
 * network call).
 */
export type FlowJudge = (request: JudgeRequest) => boolean | null;

export type ConditionOutcome =
  | { status: 'pass' }
  | { status: 'fail' }
  | { status: 'needs_judgment'; phrases: string[] };

const PASS: ConditionOutcome = { status: 'pass' };
const FAIL: ConditionOutcome = { status: 'fail' };

function operandValue(operand: Operand, scope: RefScope): unknown {
  if ('ref' in operand) return resolveRef(operand.ref, scope);
  if ('value' in operand) return operand.value;
  return operand.values;
}

const isScalar = (value: unknown): value is Scalar =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function same(a: unknown, b: unknown, caseSensitive: boolean): boolean {
  if (!isScalar(a) || !isScalar(b)) return false;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  if (typeof a === 'string' && typeof b === 'string' && !caseSensitive) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

const text = (value: unknown, caseSensitive: boolean) =>
  typeof value === 'string' ? (caseSensitive ? value : value.toLowerCase()) : null;

function contains(left: unknown, right: unknown, caseSensitive: boolean): boolean {
  if (Array.isArray(left)) return left.some((item) => same(item, right, caseSensitive));
  const haystack = text(left, caseSensitive);
  const needle = isScalar(right) && right !== null ? text(String(right), caseSensitive) : null;
  return haystack !== null && needle !== null && haystack.includes(needle);
}

function compare(
  op: CompareOperator,
  left: unknown,
  right: unknown,
  caseSensitive: boolean
): boolean {
  switch (op) {
    case 'eq':
      return same(left, right, caseSensitive);
    case 'neq':
      return !same(left, right, caseSensitive);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = asNumber(left);
      const b = asNumber(right);
      if (a === null || b === null) return false;
      if (op === 'gt') return a > b;
      if (op === 'gte') return a >= b;
      if (op === 'lt') return a < b;
      return a <= b;
    }
    case 'contains':
      return contains(left, right, caseSensitive);
    case 'not_contains':
      return !contains(left, right, caseSensitive);
    case 'starts_with':
    case 'ends_with': {
      const a = text(left, caseSensitive);
      const b = isScalar(right) && right !== null ? text(String(right), caseSensitive) : null;
      if (a === null || b === null) return false;
      return op === 'starts_with' ? a.startsWith(b) : a.endsWith(b);
    }
    case 'in':
    case 'not_in': {
      const list = Array.isArray(right) ? right : [right];
      const found = list.some((item) => same(left, item, caseSensitive));
      return op === 'in' ? found : !found;
    }
  }
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function runTest(test: ValueTest, value: unknown): boolean {
  switch (test) {
    case 'exists':
      return value !== undefined && value !== null;
    case 'missing':
      return value === undefined || value === null;
    case 'empty':
      return isEmpty(value);
    case 'not_empty':
      return !isEmpty(value);
    case 'true':
      return value === true;
    case 'false':
      return value === false;
  }
}

/**
 * Evaluates a condition against a run scope with three-valued logic: `all`
 * fails on any failure, `any` passes on any pass, and an undecided `judge`
 * leaves the result `needs_judgment` (listing its phrases) only when the
 * other parts cannot settle it. Pure: no clock, randomness or I/O.
 */
export function evaluateCondition(
  condition: Condition,
  scope: RefScope = {},
  options: { judge?: FlowJudge } = {}
): ConditionOutcome {
  switch (condition.type) {
    case 'compare': {
      const left = operandValue(condition.left, scope);
      const right = operandValue(condition.right, scope);
      return compare(condition.op, left, right, condition.caseSensitive === true) ? PASS : FAIL;
    }
    case 'test':
      return runTest(condition.test, resolveRef(condition.subject, scope)) ? PASS : FAIL;
    case 'not': {
      const inner = evaluateCondition(condition.condition, scope, options);
      if (inner.status === 'needs_judgment') return inner;
      return inner.status === 'pass' ? FAIL : PASS;
    }
    case 'all':
    case 'any': {
      const decisive = condition.type === 'all' ? 'fail' : 'pass';
      const phrases: string[] = [];
      for (const child of condition.conditions) {
        const outcome = evaluateCondition(child, scope, options);
        if (outcome.status === decisive) return outcome;
        if (outcome.status === 'needs_judgment') phrases.push(...outcome.phrases);
      }
      if (phrases.length > 0) return { status: 'needs_judgment', phrases };
      return condition.type === 'all' ? PASS : FAIL;
    }
    case 'judge': {
      const decided = options.judge?.({
        phrase: condition.phrase,
        judge: condition.judge ?? 'assistant',
        scope,
      });
      if (decided === true) return PASS;
      if (decided === false) return FAIL;
      return { status: 'needs_judgment', phrases: [condition.phrase] };
    }
  }
}

/* ---------- reading ---------- */

const OPERATOR_LABELS: Record<CompareOperator, string> = {
  eq: 'is',
  neq: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  in: 'is one of',
  not_in: 'is not one of',
};

const TEST_LABELS: Record<ValueTest, string> = {
  exists: 'is set',
  missing: 'is not set',
  empty: 'is empty',
  not_empty: 'has something in it',
  true: 'is yes',
  false: 'is no',
};

function describeOperand(operand: Operand): string {
  if ('ref' in operand) return describeRef(operand.ref);
  if ('value' in operand) return JSON.stringify(operand.value);
  return operand.values.map((v) => JSON.stringify(v)).join(', ');
}

/** A plain-English reading of a condition, for editors and run logs. */
export function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case 'compare':
      return `${describeOperand(condition.left)} ${OPERATOR_LABELS[condition.op]} ${describeOperand(condition.right)}`;
    case 'test':
      return `${describeRef(condition.subject)} ${TEST_LABELS[condition.test]}`;
    case 'all':
    case 'any': {
      const joiner = condition.type === 'all' ? ' and ' : ' or ';
      const parts = condition.conditions.map((child) => {
        const inner = describeCondition(child);
        return child.type === 'all' || child.type === 'any' ? `(${inner})` : inner;
      });
      return parts.join(joiner);
    }
    case 'not':
      return `not (${describeCondition(condition.condition)})`;
    case 'judge':
      return condition.phrase;
  }
}
