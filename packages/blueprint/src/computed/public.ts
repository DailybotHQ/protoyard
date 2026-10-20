import { parseExpressionShape } from './schema.ts';
import type { ComputedDiagnostic, ComputedExpression } from './types.ts';

export {
  MAX_COMPUTED_EXPRESSION_DEPTH,
  MAX_COMPUTED_EXPRESSION_NODES,
} from './schema.ts';

export class ComputedExpressionError extends Error {
  readonly diagnostics: ComputedDiagnostic[];

  constructor(diagnostics: ComputedDiagnostic[]) {
    super(
      diagnostics.map((diagnostic) => `${diagnostic.jsonPath}: ${diagnostic.message}`).join('\n')
    );
    this.name = 'ComputedExpressionError';
    this.diagnostics = diagnostics;
  }
}

export function safeParseComputedExpression(
  input: unknown
):
  | { success: true; data: ComputedExpression }
  | { success: false; diagnostics: ComputedDiagnostic[] } {
  return parseExpressionShape(input);
}

export function parseComputedExpression(input: unknown): ComputedExpression {
  const result = parseExpressionShape(input);
  if (!result.success) throw new ComputedExpressionError(result.diagnostics);
  return result.data;
}
