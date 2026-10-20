import type { BlueprintEntity } from '../schema.ts';
import { parseExpressionShape } from './schema.ts';
import type {
  ComputedDiagnostic,
  ComputedExpression,
  ComputedExpressionContext,
  ComputedValidationResult,
  ComputedValueType,
} from './types.ts';

type Inferred = { type: ComputedValueType; nullable: boolean };

function pathText(path: readonly (string | number)[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  }
  return result;
}

function add(
  diagnostics: ComputedDiagnostic[],
  code: string,
  path: (string | number)[],
  message: string,
  hint: string
) {
  diagnostics.push({ code, path, jsonPath: pathText(path), message, hint });
}

function valueType(kind: string): ComputedValueType | null {
  if (['text', 'longText', 'email', 'url', 'phone', 'enum'].includes(kind)) return 'string';
  if (['number', 'integer', 'money'].includes(kind)) return 'number';
  if (kind === 'boolean') return 'boolean';
  if (kind === 'date' || kind === 'datetime') return 'date';
  return null;
}

function infer(
  expression: ComputedExpression,
  context: ComputedExpressionContext,
  path: (string | number)[],
  diagnostics: ComputedDiagnostic[]
): Inferred | null {
  if (expression.op === 'literal') {
    return {
      type:
        expression.value === null
          ? 'null'
          : typeof expression.value === 'number'
            ? 'number'
            : typeof expression.value === 'boolean'
              ? 'boolean'
              : 'string',
      nullable: expression.value === null,
    };
  }
  if (expression.op === 'field') {
    const field = context.sourceEntity.fields.find(
      (candidate) => candidate.name === expression.field
    );
    if (!field) {
      add(
        diagnostics,
        'unknown-field',
        [...path, 'field'],
        `unknown field "${expression.field}" on "${context.sourceEntity.name}"`,
        'Use a field declared on the source entity or add it before referencing it.'
      );
      return null;
    }
    const type = valueType(field.kind);
    if (!type) {
      add(
        diagnostics,
        'unsupported-field-type',
        [...path, 'field'],
        `field "${expression.field}" has unsupported computed type "${field.kind}"`,
        'Reference a scalar text, number, integer, money, boolean, date, datetime or enum field.'
      );
      return null;
    }
    return { type, nullable: !('required' in field && field.required === true) };
  }
  if (expression.op === 'aggregate') {
    const relation = context.sourceEntity.fields.find(
      (candidate) => candidate.name === expression.relation
    );
    if (relation?.kind !== 'relation' || !('to' in relation)) {
      add(
        diagnostics,
        'invalid-relation',
        [...path, 'relation'],
        `"${expression.relation}" is not a relation field on "${context.sourceEntity.name}"`,
        'Set relation to a relation field declared on the source entity.'
      );
      return null;
    }
    const target = context.entities.find((entity) => entity.name === relation.to);
    if (!target) {
      add(
        diagnostics,
        'unknown-relation-target',
        [...path, 'relation'],
        `relation "${expression.relation}" targets unknown entity "${relation.to}"`,
        'Declare the relation target entity before using an aggregate.'
      );
      return null;
    }
    if (expression.aggregate === 'count') {
      if (expression.field !== undefined) {
        add(
          diagnostics,
          'unexpected-aggregate-field',
          [...path, 'field'],
          'count does not take a field',
          'Remove field from a count aggregate.'
        );
        return null;
      }
      return { type: 'number', nullable: false };
    }
    if (expression.field === undefined) {
      add(
        diagnostics,
        'missing-aggregate-field',
        [...path, 'field'],
        `${expression.aggregate} needs a field`,
        'Set field to a supported scalar field on the relation target.'
      );
      return null;
    }
    const field = target.fields.find((candidate) => candidate.name === expression.field);
    if (!field) {
      add(
        diagnostics,
        'unknown-field',
        [...path, 'field'],
        `unknown field "${expression.field}" on relation target "${target.name}"`,
        'Use a field declared on the relation target entity.'
      );
      return null;
    }
    const type = valueType(field.kind);
    const accepted =
      expression.aggregate === 'min' || expression.aggregate === 'max'
        ? type === 'number' || type === 'date'
        : type === 'number';
    if (!accepted) {
      add(
        diagnostics,
        'invalid-aggregate-type',
        [...path, 'field'],
        `${expression.aggregate} cannot aggregate field kind "${field.kind}"`,
        expression.aggregate === 'min' || expression.aggregate === 'max'
          ? 'Choose a number, integer, money, date or datetime field.'
          : 'Choose a number, integer or money field.'
      );
      return null;
    }
    return { type: type as ComputedValueType, nullable: true };
  }
  if (expression.op === 'concat') {
    const children = expression.values.map((value, index) =>
      infer(value, context, [...path, 'values', index], diagnostics)
    );
    const invalid = children.some(
      (child) => child === null || (child.type !== 'string' && child.type !== 'null')
    );
    if (invalid) {
      add(
        diagnostics,
        'invalid-operand-type',
        [...path, 'values'],
        'concat accepts only string expressions',
        'Use text-like fields or string literals in concat.'
      );
      return null;
    }
    return { type: 'string', nullable: children.some((child) => child?.nullable) };
  }
  if (expression.op === 'dateDiff') {
    const start = infer(expression.start, context, [...path, 'start'], diagnostics);
    const end = infer(expression.end, context, [...path, 'end'], diagnostics);
    if (start && start.type !== 'date' && start.type !== 'null') {
      add(
        diagnostics,
        'invalid-operand-type',
        [...path, 'start'],
        'dateDiff start must be a date or datetime expression',
        'Use a date or datetime field.'
      );
    }
    if (end && end.type !== 'date' && end.type !== 'null') {
      add(
        diagnostics,
        'invalid-operand-type',
        [...path, 'end'],
        'dateDiff end must be a date or datetime expression',
        'Use a date or datetime field.'
      );
    }
    if (
      !start ||
      !end ||
      (start.type !== 'date' && start.type !== 'null') ||
      (end.type !== 'date' && end.type !== 'null')
    )
      return null;
    return { type: 'number', nullable: start.nullable || end.nullable };
  }

  const left = infer(expression.left, context, [...path, 'left'], diagnostics);
  const right = infer(expression.right, context, [...path, 'right'], diagnostics);
  if (left && left.type !== 'number') {
    add(
      diagnostics,
      'invalid-operand-type',
      [...path, 'left'],
      `${expression.op} left operand must be numeric`,
      'Use a number, integer, money field or numeric literal.'
    );
  }
  if (right && right.type !== 'number') {
    add(
      diagnostics,
      'invalid-operand-type',
      [...path, 'right'],
      `${expression.op} right operand must be numeric`,
      'Use a number, integer, money field or numeric literal.'
    );
  }
  if (!left || !right || left.type !== 'number' || right.type !== 'number') return null;
  return {
    type: 'number',
    nullable: left.nullable || right.nullable || expression.op === 'divide',
  };
}

/** Validate AST shape, field references, operator input types and inferred output type. */
export function validateComputedExpression(
  input: unknown,
  context: ComputedExpressionContext
): ComputedValidationResult {
  const parsed = parseExpressionShape(input);
  if (!parsed.success) {
    return { valid: false, diagnostics: parsed.diagnostics, resultType: null, nullable: false };
  }
  const diagnostics: ComputedDiagnostic[] = [];
  const inferred = infer(parsed.data, context, [], diagnostics);
  return {
    valid: diagnostics.length === 0 && inferred !== null,
    diagnostics,
    resultType: diagnostics.length === 0 ? (inferred?.type ?? null) : null,
    nullable: diagnostics.length === 0 ? (inferred?.nullable ?? false) : false,
  };
}

/** Helper for callers that need to use the public entity shape as context. */
export function computedContext(
  sourceEntity: BlueprintEntity,
  entities: readonly BlueprintEntity[]
): ComputedExpressionContext {
  return { sourceEntity, entities };
}
