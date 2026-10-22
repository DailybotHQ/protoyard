import { z } from 'zod';
import type { Condition, FormulaDiagnostic, FormulaParseResult, NumberFormula } from './types.ts';

/** Caps that keep parsing and evaluation small and linear. */
export const FORMULA_LIMITS = Object.freeze({
  /** Formula nodes (JSON objects) in one formula. */
  nodes: 64,
  /** Nesting of formula nodes; the root is depth 1. */
  depth: 12,
  /** Operands of `min`, `max`, `and` and `or`. */
  args: 8,
  /** `pow` exponents beyond ±64 evaluate to null. */
  exponent: 64,
  /** `round` digits, from −6 (millions) to 6 decimals. */
  roundDigits: 6,
  /** Literal magnitude. */
  literal: 1e15,
});

const NUMBER_OPS = [
  'num',
  'var',
  'add',
  'sub',
  'mul',
  'div',
  'pow',
  'min',
  'max',
  'round',
  'clamp',
  'if',
] as const;
const CONDITION_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'and', 'or', 'not'] as const;

/** A formula variable: lowerCamelCase, like calculator input names. */
export const FormulaVariableNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]{0,31}$/, 'Use a lowerCamelCase name of at most 32 characters');

export const NumberFormulaSchema: z.ZodType<NumberFormula> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('num'),
      value: z.number().finite().min(-FORMULA_LIMITS.literal).max(FORMULA_LIMITS.literal),
    }),
    z.strictObject({ op: z.literal('var'), name: FormulaVariableNameSchema }),
    ...(['add', 'sub', 'mul', 'div'] as const).map((op) =>
      z.strictObject({ op: z.literal(op), left: NumberFormulaSchema, right: NumberFormulaSchema })
    ),
    z.strictObject({
      op: z.literal('pow'),
      base: NumberFormulaSchema,
      exponent: NumberFormulaSchema,
    }),
    ...(['min', 'max'] as const).map((op) =>
      z.strictObject({
        op: z.literal(op),
        args: z.array(NumberFormulaSchema).min(2).max(FORMULA_LIMITS.args),
      })
    ),
    z.strictObject({
      op: z.literal('round'),
      value: NumberFormulaSchema,
      digits: z
        .number()
        .int()
        .min(-FORMULA_LIMITS.roundDigits)
        .max(FORMULA_LIMITS.roundDigits)
        .optional(),
    }),
    z.strictObject({
      op: z.literal('clamp'),
      value: NumberFormulaSchema,
      min: NumberFormulaSchema,
      max: NumberFormulaSchema,
    }),
    z.strictObject({
      op: z.literal('if'),
      test: ConditionSchema,
      ifTrue: NumberFormulaSchema,
      ifFalse: NumberFormulaSchema,
    }),
  ])
);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('not'), value: ConditionSchema }),
    ...(['lt', 'lte', 'gt', 'gte', 'eq', 'neq'] as const).map((op) =>
      z.strictObject({ op: z.literal(op), left: NumberFormulaSchema, right: NumberFormulaSchema })
    ),
    ...(['and', 'or'] as const).map((op) =>
      z.strictObject({
        op: z.literal(op),
        args: z.array(ConditionSchema).min(2).max(FORMULA_LIMITS.args),
      })
    ),
  ])
);

export function formulaJsonPath(path: readonly (string | number)[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  }
  return result;
}

function diagnostic(
  code: string,
  path: (string | number)[],
  message: string,
  hint: string
): FormulaDiagnostic {
  return { code, path, jsonPath: formulaJsonPath(path), message, hint };
}

/**
 * Rejects cycles, non-plain objects and oversize input before any recursive
 * parsing, so hostile JSON never reaches zod's recursion. Formula nodes are
 * the JSON objects; arrays (operand lists) do not add depth.
 */
function preflight(input: unknown): FormulaDiagnostic | null {
  const seen = new WeakSet<object>();
  const stack: { value: unknown; depth: number; path: (string | number)[] }[] = [
    { value: input, depth: 0, path: [] },
  ];
  let nodes = 0;
  let containers = 0;
  const tooLarge = (path: (string | number)[]) =>
    diagnostic(
      'formula-too-large',
      path,
      `A formula has at most ${FORMULA_LIMITS.nodes} nodes`,
      'Split the calculation into several outputs, or simplify it.'
    );
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value, path } = current;
    if (value === null || typeof value !== 'object') continue;
    if (seen.has(value)) {
      return diagnostic(
        'cyclic-formula',
        path,
        'A formula must not contain cycles',
        'Use plain JSON.'
      );
    }
    seen.add(value);
    containers += 1;
    if (containers > FORMULA_LIMITS.nodes * 2) return tooLarge(path);
    if (Array.isArray(value)) {
      if (value.length > FORMULA_LIMITS.nodes) return tooLarge(path);
      for (let i = value.length - 1; i >= 0; i -= 1) {
        stack.push({ value: value[i], depth: current.depth, path: [...path, i] });
      }
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return diagnostic(
        'invalid-container',
        path,
        'Formula nodes must be plain JSON objects',
        'Use plain JSON.'
      );
    }
    nodes += 1;
    if (nodes > FORMULA_LIMITS.nodes) return tooLarge(path);
    const depth = current.depth + 1;
    if (depth > FORMULA_LIMITS.depth) {
      return diagnostic(
        'formula-too-deep',
        path,
        `A formula nests at most ${FORMULA_LIMITS.depth} levels`,
        'Flatten the calculation, for example with min/max over several operands.'
      );
    }
    const keys = Object.keys(value);
    if (keys.length > 8) {
      return diagnostic(
        'invalid-formula',
        path,
        'A formula node has too many keys',
        'Use only the keys of its op.'
      );
    }
    for (const key of keys.reverse()) {
      stack.push({ value: (value as Record<string, unknown>)[key], depth, path: [...path, key] });
    }
  }
  return null;
}

/** The parent node of a path that ends in `op`, read from the raw input. */
function rawAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

const isNumberOp = (op: unknown) => (NUMBER_OPS as readonly unknown[]).includes(op);
const isConditionOp = (op: unknown) => (CONDITION_OPS as readonly unknown[]).includes(op);

/** Turns zod issues into diagnostics; a valid op of the wrong kind is a type mismatch. */
function shapeDiagnostics(input: unknown, error: z.ZodError): FormulaDiagnostic[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) =>
      typeof segment === 'number' ? segment : String(segment)
    );
    const last = path[path.length - 1];
    if (last === 'op' && issue.code === 'invalid_union') {
      const op = rawAt(input, path);
      const nodePath = path.slice(0, -1);
      const expectsCondition = expectedKindAt(input, nodePath) === 'condition';
      if (expectsCondition && isNumberOp(op)) {
        return diagnostic(
          'type-mismatch',
          nodePath,
          `Expected a condition here, got the number expression "${String(op)}"`,
          'Compare two numbers with lt, lte, gt, gte, eq or neq.'
        );
      }
      if (!expectsCondition && isConditionOp(op)) {
        return diagnostic(
          'type-mismatch',
          nodePath,
          `Expected a number here, got the condition "${String(op)}"`,
          'Turn a condition into a number with { "op": "if", "test": …, "ifTrue": …, "ifFalse": … }.'
        );
      }
      return diagnostic(
        'unknown-op',
        nodePath,
        `Unknown formula op ${JSON.stringify(op)}`,
        `Use one of ${(expectsCondition ? CONDITION_OPS : NUMBER_OPS).join(', ')}.`
      );
    }
    return diagnostic(
      'invalid-formula',
      path,
      issue.message,
      'Check this node against the formula grammar in @protoyard/blocks/formula.'
    );
  });
}

/**
 * Whether the node at `path` must be a number or a condition, from the ops of
 * its ancestors: `if.test`, `not.value` and the operands of `and`/`or` are
 * conditions; everything else, including the root, is a number.
 */
function expectedKindAt(
  input: unknown,
  path: readonly (string | number)[]
): 'number' | 'condition' {
  let kind: 'number' | 'condition' = 'number';
  let node = input;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return kind;
    const op = (node as Record<string, unknown>).op;
    if (segment === 'args') {
      const index = path[i + 1];
      kind = op === 'and' || op === 'or' ? 'condition' : 'number';
      const list = (node as Record<string, unknown>).args;
      node = Array.isArray(list) && typeof index === 'number' ? list[index] : undefined;
      i += 1;
      continue;
    }
    if (segment === 'test') kind = 'condition';
    else if (segment === 'value' && op === 'not') kind = 'condition';
    else kind = 'number';
    node = (node as Record<string, unknown>)[segment as string];
  }
  return kind;
}

/** Variable names a formula reads, sorted and unique. */
export function formulaVariables(formula: NumberFormula | Condition): string[] {
  const names = new Set<string>();
  const visit = (node: NumberFormula | Condition): void => {
    switch (node.op) {
      case 'num':
        return;
      case 'var':
        names.add(node.name);
        return;
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte':
      case 'eq':
      case 'neq':
        visit(node.left);
        visit(node.right);
        return;
      case 'pow':
        visit(node.base);
        visit(node.exponent);
        return;
      case 'min':
      case 'max':
      case 'and':
      case 'or':
        for (const arg of node.args) visit(arg);
        return;
      case 'round':
      case 'not':
        visit(node.value);
        return;
      case 'clamp':
        visit(node.value);
        visit(node.min);
        visit(node.max);
        return;
      case 'if':
        visit(node.test);
        visit(node.ifTrue);
        visit(node.ifFalse);
        return;
    }
  };
  visit(formula);
  return [...names].sort();
}

function variablePaths(
  node: unknown,
  path: (string | number)[],
  out: { name: string; path: (string | number)[] }[]
): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      variablePaths(child, [...path, i], out);
    });
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.op === 'var' && typeof record.name === 'string') {
    out.push({ name: record.name, path: [...path, 'name'] });
    return;
  }
  for (const [key, child] of Object.entries(record)) variablePaths(child, [...path, key], out);
}

export interface ParseFormulaOptions {
  /** Known input names. When given, any other variable is an `unknown-variable` diagnostic. */
  variables?: readonly string[];
}

/** Validates untrusted formula JSON. Never throws and never executes anything. */
export function parseFormula(
  input: unknown,
  options: ParseFormulaOptions = {}
): FormulaParseResult {
  const failed = (diagnostics: FormulaDiagnostic[]): FormulaParseResult => ({
    success: false,
    formula: null,
    variables: [],
    diagnostics,
  });
  const size = preflight(input);
  if (size) return failed([size]);
  const result = NumberFormulaSchema.safeParse(input);
  if (!result.success) return failed(shapeDiagnostics(input, result.error));
  if (options.variables) {
    const known = new Set(options.variables);
    const found: { name: string; path: (string | number)[] }[] = [];
    variablePaths(result.data, [], found);
    const unknown = found.filter((ref) => !known.has(ref.name));
    if (unknown.length > 0) {
      return failed(
        unknown.map((ref) =>
          diagnostic(
            'unknown-variable',
            ref.path,
            `Unknown variable "${ref.name}"`,
            known.size > 0
              ? `Use one of the calculator inputs: ${[...known].sort().join(', ')}.`
              : 'Add a calculator input with this name.'
          )
        )
      );
    }
  }
  return {
    success: true,
    formula: result.data,
    variables: formulaVariables(result.data),
    diagnostics: [],
  };
}
