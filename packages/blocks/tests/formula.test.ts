// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Condition,
  evaluateCondition,
  evaluateFormula,
  FORMULA_LIMITS,
  type FormulaInputs,
  FormulaVariableNameSchema,
  formatFormulaValue,
  formulaVariables,
  type NumberFormula,
  parseFormula,
  roundTo,
} from '../src/formula/index.ts';
import { safeParseBlock } from '../src/index.ts';

const n = (value: number): NumberFormula => ({ op: 'num', value });
const v = (name: string): NumberFormula => ({ op: 'var', name });
const add = (left: NumberFormula, right: NumberFormula): NumberFormula => ({
  op: 'add',
  left,
  right,
});

/** Parses (asserting success) and evaluates. */
function run(input: unknown, inputs: FormulaInputs = {}): number | null {
  const parsed = parseFormula(input);
  expect(parsed.diagnostics).toEqual([]);
  if (!parsed.success) throw new Error('unreachable');
  return evaluateFormula(parsed.formula, inputs);
}

describe('formula evaluation', () => {
  const inputs = { seats: 8, price: 1200, rate: 0.2, zero: 0, neg: -3 };

  it.each<[string, NumberFormula, number | null]>([
    ['literal', n(42), 42],
    ['variable', v('seats'), 8],
    ['add', add(v('seats'), n(2)), 10],
    ['sub', { op: 'sub', left: n(1), right: v('seats') }, -7],
    ['mul', { op: 'mul', left: v('seats'), right: v('price') }, 9600],
    ['div', { op: 'div', left: v('price'), right: n(8) }, 150],
    ['pow', { op: 'pow', base: n(2), exponent: n(10) }, 1024],
    ['negative pow', { op: 'pow', base: n(2), exponent: n(-2) }, 0.25],
    ['min', { op: 'min', args: [v('seats'), n(3), n(9)] }, 3],
    ['max', { op: 'max', args: [v('neg'), n(-10)] }, -3],
    ['round', { op: 'round', value: n(2.5) }, 3],
    ['round negative half away from zero', { op: 'round', value: n(-2.5) }, -3],
    ['round digits', { op: 'round', value: n(1.005), digits: 2 }, 1.01],
    ['round to hundreds', { op: 'round', value: n(1249), digits: -2 }, 1200],
    ['clamp low', { op: 'clamp', value: n(-5), min: n(0), max: n(10) }, 0],
    ['clamp high', { op: 'clamp', value: n(50), min: n(0), max: n(10) }, 10],
    ['clamp inside', { op: 'clamp', value: n(5), min: n(0), max: n(10) }, 5],
    [
      'if true',
      { op: 'if', test: { op: 'gte', left: v('seats'), right: n(5) }, ifTrue: n(1), ifFalse: n(2) },
      1,
    ],
    [
      'if false',
      { op: 'if', test: { op: 'lt', left: v('seats'), right: n(5) }, ifTrue: n(1), ifFalse: n(2) },
      2,
    ],
    [
      'tiered price',
      {
        op: 'mul',
        left: v('seats'),
        right: {
          op: 'if',
          test: {
            op: 'and',
            args: [
              { op: 'gt', left: v('seats'), right: n(5) },
              { op: 'not', value: { op: 'eq', left: v('rate'), right: n(0) } },
            ],
          },
          ifTrue: {
            op: 'mul',
            left: v('price'),
            right: { op: 'sub', left: n(1), right: v('rate') },
          },
          ifFalse: v('price'),
        },
      },
      7680,
    ],
    ['negative zero becomes zero', { op: 'mul', left: n(-1), right: n(0) }, 0],
  ])('evaluates %s', (_name, formula, expected) => {
    const result = run(formula, inputs);
    expect(result).toBe(expected);
    if (result === 0) expect(Object.is(result, -0)).toBe(false);
  });

  it.each<[string, NumberFormula, FormulaInputs]>([
    ['division by zero', { op: 'div', left: n(1), right: v('zero') }, { zero: 0 }],
    ['zero by zero (NaN)', { op: 'div', left: n(0), right: n(0) }, {}],
    [
      'overflow to Infinity',
      {
        op: 'mul',
        left: n(1e15),
        right: { op: 'mul', left: n(1e15), right: { op: 'pow', base: n(1e15), exponent: n(20) } },
      },
      {},
    ],
    ['exponent over the cap', { op: 'pow', base: n(1), exponent: n(65) }, {}],
    ['negative base with a fractional exponent', { op: 'pow', base: n(-8), exponent: n(0.5) }, {}],
    ['a missing input', add(v('missing'), n(1)), {}],
    ['a null input', add(v('x'), n(1)), { x: null }],
    ['a NaN input', add(v('x'), n(1)), { x: Number.NaN }],
    ['an Infinity input', add(v('x'), n(1)), { x: Number.POSITIVE_INFINITY }],
    ['clamp with min above max', { op: 'clamp', value: n(1), min: n(5), max: n(2) }, {}],
    [
      'an undefined if test',
      { op: 'if', test: { op: 'gt', left: v('x'), right: n(0) }, ifTrue: n(1), ifFalse: n(2) },
      {},
    ],
    ['one undefined min operand', { op: 'min', args: [n(1), v('x')] }, {}],
  ])('gives null for %s', (_name, formula, given) => {
    expect(run(formula, given)).toBeNull();
  });

  it('never reads inherited properties as inputs', () => {
    for (const name of ['toString', 'valueOf', 'hasOwnProperty']) {
      expect(run(v(name), {}), name).toBeNull();
    }
    // The schema refuses "constructor"; the evaluator stays safe without it.
    expect(evaluateFormula(v('constructor'), {})).toBeNull();
    const inherited = Object.create({ seats: 5 }) as FormulaInputs;
    expect(run(v('seats'), inherited)).toBeNull();
    expect(run(v('seats'), { seats: '5' } as unknown as FormulaInputs)).toBeNull();
  });

  it('uses three-valued logic for and, or and not', () => {
    const unknown: Condition = { op: 'gt', left: v('x'), right: n(0) };
    const yes: Condition = { op: 'eq', left: n(1), right: n(1) };
    const no: Condition = { op: 'neq', left: n(1), right: n(1) };
    expect(evaluateCondition({ op: 'and', args: [unknown, no] }, {})).toBe(false);
    expect(evaluateCondition({ op: 'and', args: [unknown, yes] }, {})).toBeNull();
    expect(evaluateCondition({ op: 'or', args: [unknown, yes] }, {})).toBe(true);
    expect(evaluateCondition({ op: 'or', args: [unknown, no] }, {})).toBeNull();
    expect(evaluateCondition({ op: 'not', value: unknown }, {})).toBeNull();
    expect(evaluateCondition({ op: 'not', value: no }, {})).toBe(true);
    for (const [op, expected] of [
      ['lt', true],
      ['lte', true],
      ['gt', false],
      ['gte', false],
      ['eq', false],
      ['neq', true],
    ] as const) {
      expect(evaluateCondition({ op, left: n(1), right: n(2) }, {}), op).toBe(expected);
    }
  });

  it('is deterministic and does not mutate the formula or the inputs', () => {
    const formula: NumberFormula = {
      op: 'mul',
      left: v('a'),
      right: { op: 'round', value: v('b'), digits: 1 },
    };
    const given = Object.freeze({ a: 3, b: 1.25 });
    const frozen = structuredClone(formula);
    const first = run(formula, given);
    expect(run(formula, given)).toBe(first);
    expect(formula).toEqual(frozen);
    expect(first).toBeCloseTo(3.9, 12);
  });

  it('rounds half away from zero, tolerating binary noise', () => {
    expect(roundTo(0.5)).toBe(1);
    expect(roundTo(-0.5)).toBe(-1);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(123456, -3)).toBe(123000);
    expect(roundTo(0)).toBe(0);
  });

  it('never throws on unvalidated garbage and returns null', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'add',
      {},
      { op: 'exec' },
      { op: 'add' },
      { op: 'min', args: 'x' },
      { op: 'if', test: null, ifTrue: n(1), ifFalse: n(2) },
      { op: 'var', name: '__proto__' },
    ];
    for (const value of garbage) {
      expect(
        () => evaluateFormula(value as NumberFormula, {}),
        JSON.stringify(value)
      ).not.toThrow();
      expect(evaluateFormula(value as NumberFormula, {})).toBeNull();
    }
  });

  it('stops at the depth cap even for an unvalidated deep formula', () => {
    let deep: NumberFormula = n(1);
    for (let i = 0; i < 5_000; i += 1) deep = add(deep, n(1));
    expect(() => evaluateFormula(deep, {})).not.toThrow();
    expect(evaluateFormula(deep, {})).toBeNull();
  });
});

describe('variable names', () => {
  it('reserves constructor and prototype (form responses refuse them as keys)', () => {
    expect(FormulaVariableNameSchema.safeParse('constructor').success).toBe(false);
    expect(FormulaVariableNameSchema.safeParse('prototype').success).toBe(false);
    expect(FormulaVariableNameSchema.safeParse('hoursSaved').success).toBe(true);
    expect(
      safeParseBlock({
        type: 'form',
        id: 'signup',
        title: 'Join the beta',
        fields: [{ name: 'constructor', label: 'Name', type: 'text' }],
        submitLabel: 'Request access',
        successMessage: 'Thanks! This is a simulated form; nothing was sent.',
      }).success
    ).toBe(false);
    expect(
      safeParseBlock({
        type: 'form',
        id: 'signup',
        title: 'Join the beta',
        fields: [{ name: 'company', label: 'Name', type: 'text' }],
        submitLabel: 'Request access',
        successMessage: 'Thanks! This is a simulated form; nothing was sent.',
      }).success
    ).toBe(true);
  });
});

describe('formula parsing and diagnostics', () => {
  it('lists free variables, sorted and unique', () => {
    const parsed = parseFormula({
      op: 'if',
      test: { op: 'gt', left: v('seats'), right: v('limit') },
      ifTrue: { op: 'max', args: [v('seats'), v('base'), v('seats')] },
      ifFalse: n(0),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.variables).toEqual(['base', 'limit', 'seats']);
    if (parsed.success) expect(formulaVariables(parsed.formula)).toEqual(parsed.variables);
  });

  it('accepts a formula at exactly the node and depth caps', () => {
    let deep: NumberFormula = n(1);
    for (let i = 1; i < FORMULA_LIMITS.depth; i += 1) deep = { op: 'round', value: deep };
    expect(parseFormula(deep).success).toBe(true);
    const wide: NumberFormula = {
      op: 'max',
      args: Array.from({ length: 8 }, () => ({
        op: 'min',
        args: Array.from({ length: 6 }, () => n(1)),
      })),
    };
    // 1 + 8 + 48 = 57 nodes, depth 3.
    expect(parseFormula(wide).success).toBe(true);
  });

  it('rejects a formula over the node cap with a jsonPath', () => {
    // 1 + 8 + 64 = 73 nodes at depth 3.
    const wide = {
      op: 'max',
      args: Array.from({ length: 8 }, () => ({
        op: 'min',
        args: Array.from({ length: 8 }, () => n(1)),
      })),
    };
    const parsed = parseFormula(wide);
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics[0]?.code).toBe('formula-too-large');
    expect(parsed.diagnostics[0]?.jsonPath).toMatch(/^\$/);
  });

  it('rejects a formula over the depth cap at the offending node', () => {
    let deep: NumberFormula = n(1);
    for (let i = 0; i < FORMULA_LIMITS.depth; i += 1) deep = { op: 'round', value: deep };
    const parsed = parseFormula(deep);
    expect(parsed.diagnostics[0]?.code).toBe('formula-too-deep');
    expect(parsed.diagnostics[0]?.jsonPath).toBe(`$${'["value"]'.repeat(FORMULA_LIMITS.depth)}`);
  });

  it('rejects huge arrays, cycles and non-plain objects before parsing', () => {
    expect(
      parseFormula({ op: 'max', args: Array.from({ length: 10_000 }, () => n(1)) }).diagnostics[0]
        ?.code
    ).toBe('formula-too-large');
    const cyclic: Record<string, unknown> = { op: 'add', right: n(1) };
    cyclic.left = cyclic;
    expect(parseFormula(cyclic).diagnostics[0]?.code).toBe('cyclic-formula');
    expect(parseFormula(new Date()).diagnostics[0]?.code).toBe('invalid-container');
    expect(parseFormula({ op: 'num', value: new Number(1) }).diagnostics[0]?.code).toBe(
      'invalid-container'
    );
  });

  it('reports a condition used as a number as a type mismatch', () => {
    const parsed = parseFormula(add({ op: 'lt', left: n(1), right: n(2) } as never, n(1)));
    expect(parsed.diagnostics).toMatchObject([
      { code: 'type-mismatch', jsonPath: '$["left"]', message: expect.stringMatching(/number/) },
    ]);
    expect(parsed.diagnostics[0]?.hint).toMatch(/"if"/);
  });

  it('reports a number used as a condition as a type mismatch', () => {
    const inIf = parseFormula({ op: 'if', test: v('flag'), ifTrue: n(1), ifFalse: n(0) });
    expect(inIf.diagnostics).toMatchObject([{ code: 'type-mismatch', jsonPath: '$["test"]' }]);
    const inAnd = parseFormula({
      op: 'if',
      test: { op: 'and', args: [{ op: 'gt', left: n(1), right: n(0) }, n(1)] },
      ifTrue: n(1),
      ifFalse: n(0),
    });
    expect(inAnd.diagnostics).toMatchObject([
      { code: 'type-mismatch', jsonPath: '$["test"]["args"][1]' },
    ]);
    const inNot = parseFormula({
      op: 'if',
      test: { op: 'not', value: n(1) },
      ifTrue: n(1),
      ifFalse: n(0),
    });
    expect(inNot.diagnostics).toMatchObject([
      { code: 'type-mismatch', jsonPath: '$["test"]["value"]' },
    ]);
  });

  it('reports unknown ops, which are never executed', () => {
    for (const op of ['eval', 'exec', 'call', 'Function', 'constructor', '__proto__']) {
      const parsed = parseFormula({ op, code: 'alert(1)' });
      expect(parsed.diagnostics[0]?.code, op).toBe('unknown-op');
      expect(parsed.diagnostics[0]?.jsonPath).toBe('$');
    }
    const nested = parseFormula(add(n(1), { op: 'sqrt', value: n(4) } as never));
    expect(nested.diagnostics[0]).toMatchObject({ code: 'unknown-op', jsonPath: '$["right"]' });
  });

  it('reports unknown variables against the declared inputs', () => {
    const parsed = parseFormula(add(v('seats'), { op: 'mul', left: v('typo'), right: n(2) }), {
      variables: ['seats', 'price'],
    });
    expect(parsed.diagnostics).toMatchObject([
      {
        code: 'unknown-variable',
        jsonPath: '$["right"]["left"]["name"]',
        hint: expect.stringContaining('price, seats'),
      },
    ]);
    expect(parseFormula(v('seats'), { variables: ['seats'] }).success).toBe(true);
  });

  it.each<[string, unknown, string]>([
    ['an extra key', { op: 'num', value: 1, code: 'x' }, '$'],
    [
      'a thenable then/else pair',
      // biome-ignore lint/suspicious/noThenProperty: proves a thenable-shaped node is rejected.
      { op: 'if', test: { op: 'lt', left: n(1), right: n(2) }, then: n(1), else: n(2) },
      '$',
    ],
    ['a string number', { op: 'num', value: '1' }, '$["value"]'],
    ['a non-finite literal', { op: 'num', value: Number.POSITIVE_INFINITY }, '$["value"]'],
    ['a huge literal', { op: 'num', value: 1e300 }, '$["value"]'],
    ['a bad variable name', { op: 'var', name: 'a.b' }, '$["name"]'],
    ['a prototype variable name', { op: 'var', name: '__proto__' }, '$["name"]'],
    ['too few min operands', { op: 'min', args: [n(1)] }, '$["args"]'],
    [
      'too many max operands',
      { op: 'max', args: Array.from({ length: 9 }, () => n(1)) },
      '$["args"]',
    ],
    ['fractional round digits', { op: 'round', value: n(1), digits: 1.5 }, '$["digits"]'],
    ['round digits over the cap', { op: 'round', value: n(1), digits: 7 }, '$["digits"]'],
    ['a missing operand', { op: 'add', left: n(1) }, '$["right"]'],
  ])('rejects %s with a jsonPath', (_name, input, jsonPath) => {
    const parsed = parseFormula(input);
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics.map((d) => d.jsonPath)).toContain(jsonPath);
    for (const d of parsed.diagnostics) expect(d.hint.length).toBeGreaterThan(0);
  });

  it('never throws on random hostile input (seeded)', () => {
    let seed = 0x2f6e2b1;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const ops = ['num', 'var', 'add', 'div', 'pow', 'min', 'if', 'lt', 'and', 'not', 'x'];
    const random = (depth: number): unknown => {
      const r = next();
      if (depth > 3 || r < 0.15) return [1, 'a', null, true, {}, []][Math.floor(next() * 6)];
      const op = ops[Math.floor(next() * ops.length)];
      return {
        op,
        value: next() < 0.5 ? next() * 100 : random(depth + 1),
        name: next() < 0.5 ? 'seats' : 'Seats!',
        left: random(depth + 1),
        right: random(depth + 1),
        args: [random(depth + 1), random(depth + 1)],
        test: random(depth + 1),
        ifTrue: random(depth + 1),
        ifFalse: random(depth + 1),
      };
    };
    for (let i = 0; i < 500; i += 1) {
      const input = random(0);
      expect(() => parseFormula(input)).not.toThrow();
      const parsed = parseFormula(input);
      if (parsed.success) expect(() => evaluateFormula(parsed.formula, { seats: 3 })).not.toThrow();
      else expect(parsed.diagnostics.length).toBeGreaterThan(0);
    }
  });
});

describe('formula formatting', () => {
  it('formats with the chart-spec units', () => {
    expect(formatFormulaValue(9600, 'cents')).toBe('$96.00');
    expect(formatFormulaValue(9600, 'cents', { currency: 'EUR' })).toBe('€96.00');
    expect(formatFormulaValue(0.256, 'percent')).toBe('25.6%');
    expect(formatFormulaValue(1_250_000, 'compact')).toBe('1.3M');
    expect(formatFormulaValue(1234.5678)).toBe('1,234.57');
    expect(formatFormulaValue(1234.5678, 'number', { maximumFractionDigits: 0 })).toBe('1,235');
    expect(formatFormulaValue(null)).toBe('—');
    expect(formatFormulaValue(null, 'cents', { empty: 'n/a' })).toBe('n/a');
    expect(formatFormulaValue(Number.NaN)).toBe('—');
  });
});

describe('formula source safety', () => {
  it('contains no eval, Function constructor or dynamic code', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'formula');
    const files = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8');
      expect(text, name).not.toMatch(/\beval\s*\(|new\s+Function|\bFunction\s*\(|import\s*\(/);
    }
  });
});
