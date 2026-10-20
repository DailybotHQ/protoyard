import type { ComputedEvaluationContext, ComputedExpression, ComputedValue } from './types.ts';
import { validateComputedExpression } from './validate.ts';

export type ComputedEvaluationResult =
  | { success: true; value: ComputedValue }
  | { success: false; diagnostics: ReturnType<typeof validateComputedExpression>['diagnostics'] };

function ownValue(record: Readonly<Record<string, unknown>> | undefined, key: string): unknown {
  return record && Object.hasOwn(record, key) ? record[key] : null;
}

function asMilliseconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relatedRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function evaluate(
  expression: ComputedExpression,
  context: ComputedEvaluationContext
): ComputedValue {
  if (expression.op === 'literal') return expression.value;
  if (expression.op === 'field') {
    const value = ownValue(context.row, expression.field);
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) return value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (expression.op === 'concat') {
    const values = expression.values.map((child) => evaluate(child, context));
    return values.every((value) => typeof value === 'string') ? values.join('') : null;
  }
  if (expression.op === 'dateDiff') {
    const start = asMilliseconds(evaluate(expression.start, context));
    const end = asMilliseconds(evaluate(expression.end, context));
    if (start === null || end === null) return null;
    const divisor = {
      milliseconds: 1,
      seconds: 1_000,
      minutes: 60_000,
      hours: 3_600_000,
      days: 86_400_000,
    }[expression.unit];
    return (end - start) / divisor;
  }
  if (expression.op === 'aggregate') {
    const rows = relatedRows(ownValue(context.relations, expression.relation));
    if (expression.aggregate === 'count') return rows.length;
    const values = rows
      .map((row) => ownValue(row, expression.field ?? ''))
      .filter((value) => value !== null && value !== undefined);
    if (values.length === 0) return null;
    if (expression.aggregate === 'min' || expression.aggregate === 'max') {
      const first = values[0];
      if (typeof first === 'string') {
        const dates = values.map(asMilliseconds);
        if (dates.every((date) => date !== null)) {
          const target =
            expression.aggregate === 'min'
              ? Math.min(...(dates as number[]))
              : Math.max(...(dates as number[]));
          return values.find((value) => asMilliseconds(value) === target) as string;
        }
      }
      const numbers = values.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value)
      );
      if (numbers.length !== values.length) return null;
      return expression.aggregate === 'min' ? Math.min(...numbers) : Math.max(...numbers);
    }
    const numbers = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    if (numbers.length !== values.length) return null;
    const sum = numbers.reduce((total, value) => total + value, 0);
    return expression.aggregate === 'sum' ? sum : sum / numbers.length;
  }

  const left = evaluate(expression.left, context);
  const right = evaluate(expression.right, context);
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  let value: number;
  if (expression.op === 'add') value = left + right;
  else if (expression.op === 'subtract') value = left - right;
  else if (expression.op === 'multiply') value = left * right;
  else value = right === 0 ? Number.NaN : left / right;
  return Number.isFinite(value) ? value : null;
}

/** Validate and evaluate a read-only AST. Missing or invalid row values propagate as null. */
export function evaluateComputedExpression(
  expression: unknown,
  context: ComputedEvaluationContext
): ComputedEvaluationResult {
  const validation = validateComputedExpression(expression, context);
  if (!validation.valid) return { success: false, diagnostics: validation.diagnostics };
  return { success: true, value: evaluate(expression as ComputedExpression, context) };
}
