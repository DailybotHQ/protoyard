import { z } from 'zod';
import type { ComputedDiagnostic, ComputedExpression } from './types.ts';

export const MAX_COMPUTED_EXPRESSION_DEPTH = 32;
export const MAX_COMPUTED_EXPRESSION_NODES = 256;

const fieldName = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, {
  message: 'field references must use lowerCamelCase names',
});
const scalar = z.union([z.string().max(1_000), z.number().finite(), z.boolean(), z.null()]);

const ExpressionSchema: z.ZodType<ComputedExpression> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('literal'), value: scalar }),
    z.strictObject({ op: z.literal('field'), field: fieldName }),
    ...(['add', 'subtract', 'multiply', 'divide'] as const).map((op) =>
      z.strictObject({ op: z.literal(op), left: ExpressionSchema, right: ExpressionSchema })
    ),
    z.strictObject({ op: z.literal('concat'), values: z.array(ExpressionSchema).min(2).max(32) }),
    z.strictObject({
      op: z.literal('dateDiff'),
      start: ExpressionSchema,
      end: ExpressionSchema,
      unit: z.enum(['milliseconds', 'seconds', 'minutes', 'hours', 'days']),
    }),
    z.strictObject({
      op: z.literal('aggregate'),
      relation: fieldName,
      aggregate: z.enum(['count', 'sum', 'avg', 'min', 'max']),
      field: fieldName.optional(),
    }),
  ])
);

type SizeFailure = { code: string; path: (string | number)[]; message: string };

/** Reject non-JSON containers, cycles and excessive AST size before recursive Zod parsing. */
function preflight(input: unknown): SizeFailure | null {
  const seen = new WeakSet<object>();
  const stack: { value: unknown; depth: number; path: (string | number)[] }[] = [
    { value: input, depth: 1, path: [] },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const value = current.value;
    if (value === null || typeof value !== 'object') continue;
    if (seen.has(value)) {
      return {
        code: 'cyclic-expression',
        path: current.path,
        message: 'expression data must not contain cycles',
      };
    }
    seen.add(value);
    nodes += 1;
    if (nodes > MAX_COMPUTED_EXPRESSION_NODES) {
      return {
        code: 'expression-too-large',
        path: current.path,
        message: `expression exceeds ${MAX_COMPUTED_EXPRESSION_NODES} object or array nodes`,
      };
    }
    if (current.depth > MAX_COMPUTED_EXPRESSION_DEPTH) {
      return {
        code: 'expression-too-deep',
        path: current.path,
        message: `expression exceeds depth ${MAX_COMPUTED_EXPRESSION_DEPTH}`,
      };
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_COMPUTED_EXPRESSION_NODES) {
        return {
          code: 'expression-too-large',
          path: current.path,
          message: `expression array exceeds ${MAX_COMPUTED_EXPRESSION_NODES} entries`,
        };
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: value[index],
          depth: current.depth + 1,
          path: [...current.path, index],
        });
      }
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        code: 'invalid-container',
        path: current.path,
        message: 'expression objects must be plain JSON objects',
      };
    }
    const keys = Object.keys(value);
    if (keys.length > MAX_COMPUTED_EXPRESSION_NODES) {
      return {
        code: 'expression-too-large',
        path: current.path,
        message: `expression object exceeds ${MAX_COMPUTED_EXPRESSION_NODES} properties`,
      };
    }
    for (const key of keys.reverse()) {
      stack.push({
        value: (value as Record<string, unknown>)[key],
        depth: current.depth + 1,
        path: [...current.path, key],
      });
    }
  }
  return null;
}

function jsonPath(path: readonly (string | number)[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  }
  return result;
}

export function parseExpressionShape(
  input: unknown
):
  | { success: true; data: ComputedExpression }
  | { success: false; diagnostics: ComputedDiagnostic[] } {
  const sizeFailure = preflight(input);
  if (sizeFailure) {
    return {
      success: false,
      diagnostics: [
        {
          ...sizeFailure,
          jsonPath: jsonPath(sizeFailure.path),
          hint: 'Simplify the expression and use only bounded JSON expression nodes.',
        },
      ],
    };
  }
  const result = ExpressionSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    diagnostics: result.error.issues.map((issue) => ({
      code: `schema-${issue.code}`,
      path: issue.path.filter((segment): segment is string | number => typeof segment !== 'symbol'),
      jsonPath: jsonPath(
        issue.path.filter((segment): segment is string | number => typeof segment !== 'symbol')
      ),
      message: issue.message,
      hint: 'Use the documented expression operator and its required fields; executable strings are not expressions.',
    })),
  };
}
