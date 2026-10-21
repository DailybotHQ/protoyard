import { describe, expect, it } from 'vitest';
import {
  evaluateComputedExpression,
  parseComputedExpression,
  safeParseComputedExpression,
  validateComputedExpression,
} from '../../src/computed/index.ts';

const task = {
  name: 'task',
  fields: [
    { name: 'title', kind: 'text', required: true },
    { name: 'estimate', kind: 'integer' },
    { name: 'startedAt', kind: 'datetime' },
    { name: 'finishedAt', kind: 'date' },
    { name: 'project', kind: 'relation', to: 'project' },
  ],
};
const project = {
  name: 'project',
  fields: [
    { name: 'name', kind: 'text', required: true },
    { name: 'budget', kind: 'money' },
    { name: 'active', kind: 'boolean' },
  ],
};
const context = { sourceEntity: task, entities: [task, project] };

describe('computed fields', () => {
  it('evaluates numeric expressions deterministically without mutating input rows', () => {
    const expression = {
      op: 'divide',
      left: {
        op: 'multiply',
        left: { op: 'field', field: 'estimate' },
        right: { op: 'literal', value: 2 },
      },
      right: { op: 'literal', value: 4 },
    };
    const row = { title: 'Prepare demo', estimate: 6 };
    const evaluationContext = { ...context, row };

    expect(validateComputedExpression(expression, context)).toMatchObject({
      valid: true,
      resultType: 'number',
      nullable: true,
    });
    expect(evaluateComputedExpression(expression, evaluationContext)).toEqual({
      success: true,
      value: 3,
    });
    expect(evaluateComputedExpression(expression, evaluationContext)).toEqual({
      success: true,
      value: 3,
    });
    expect(row).toEqual({ title: 'Prepare demo', estimate: 6 });
  });

  it('supports string concatenation and date differences with explicit units', () => {
    const concat = {
      op: 'concat',
      values: [
        { op: 'field', field: 'title' },
        { op: 'literal', value: '!' },
      ],
    };
    const dateDiff = {
      op: 'dateDiff',
      start: { op: 'field', field: 'startedAt' },
      end: { op: 'field', field: 'finishedAt' },
      unit: 'days',
    };
    const evaluationContext = {
      ...context,
      row: { title: 'Prepare demo', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-04' },
    };

    expect(evaluateComputedExpression(concat, evaluationContext)).toEqual({
      success: true,
      value: 'Prepare demo!',
    });
    expect(evaluateComputedExpression(dateDiff, evaluationContext)).toEqual({
      success: true,
      value: 3,
    });
  });

  it('aggregates related values and returns null for empty non-count aggregates', () => {
    const sum = { op: 'aggregate', relation: 'project', aggregate: 'sum', field: 'budget' };
    const count = { op: 'aggregate', relation: 'project', aggregate: 'count' };
    expect(
      evaluateComputedExpression(sum, {
        ...context,
        row: { title: 'Prepare demo' },
        relations: { project: [{ budget: 12_500 }, { budget: 7_500 }] },
      })
    ).toEqual({ success: true, value: 20_000 });
    expect(
      evaluateComputedExpression(count, { ...context, row: {}, relations: { project: [] } })
    ).toEqual({ success: true, value: 0 });
    expect(
      evaluateComputedExpression(sum, { ...context, row: {}, relations: { project: [] } })
    ).toEqual({ success: true, value: null });
  });

  it('rejects unknown fields, invalid operand types and invalid aggregate references', () => {
    expect(
      validateComputedExpression({ op: 'field', field: 'missing' }, context).diagnostics[0]
    ).toMatchObject({ code: 'unknown-field', jsonPath: '$["field"]' });
    expect(
      validateComputedExpression(
        { op: 'add', left: { op: 'field', field: 'title' }, right: { op: 'literal', value: 1 } },
        context
      ).diagnostics[0]
    ).toMatchObject({ code: 'invalid-operand-type' });
    expect(
      validateComputedExpression(
        { op: 'aggregate', relation: 'project', aggregate: 'sum', field: 'active' },
        context
      ).diagnostics[0]
    ).toMatchObject({ code: 'invalid-aggregate-type' });
  });

  it('treats code-like literals as inert data, rejects executable AST operators and bounds depth', () => {
    const inert = safeParseComputedExpression({ op: 'literal', value: '(() => globalThis)()' });
    expect(inert).toEqual({
      success: true,
      data: { op: 'literal', value: '(() => globalThis)()' },
    });
    const injected = safeParseComputedExpression({
      op: 'call',
      source: 'globalThis.process.exit()',
    });
    expect(injected.success).toBe(false);
    if (!injected.success)
      expect(injected.diagnostics[0]?.hint).toContain('executable strings are not expressions');

    let deep: unknown = { op: 'literal', value: 1 };
    for (let index = 0; index < 40; index += 1)
      deep = { op: 'add', left: deep, right: { op: 'literal', value: 1 } };
    const bounded = safeParseComputedExpression(deep);
    expect(bounded.success).toBe(false);
    if (!bounded.success) expect(bounded.diagnostics[0]?.code).toBe('expression-too-deep');
    expect(() =>
      parseComputedExpression({ op: 'not-allowed', source: 'new Function()' })
    ).toThrow();
  });

  it('returns null for missing values and division by zero', () => {
    expect(
      evaluateComputedExpression({ op: 'field', field: 'estimate' }, { ...context, row: {} })
    ).toEqual({ success: true, value: null });
    expect(
      evaluateComputedExpression(
        { op: 'divide', left: { op: 'literal', value: 3 }, right: { op: 'literal', value: 0 } },
        { ...context, row: {} }
      )
    ).toEqual({ success: true, value: null });
  });

  it('returns null for non-finite aggregates and reduces large collections safely', () => {
    const relationRows = Array.from({ length: 150_000 }, (_, index) => ({ budget: index }));
    for (const aggregate of ['min', 'max'] as const) {
      expect(
        evaluateComputedExpression(
          { op: 'aggregate', relation: 'project', aggregate, field: 'budget' },
          { ...context, row: {}, relations: { project: relationRows } }
        )
      ).toEqual({ success: true, value: aggregate === 'min' ? 0 : 149_999 });
    }
    expect(
      evaluateComputedExpression(
        { op: 'aggregate', relation: 'project', aggregate: 'sum', field: 'budget' },
        {
          ...context,
          row: {},
          relations: { project: [{ budget: Number.MAX_VALUE }, { budget: Number.MAX_VALUE }] },
        }
      )
    ).toEqual({ success: true, value: null });
  });
});
