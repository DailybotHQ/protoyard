// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateFormula,
  type FormulaInputs,
  type NumberFormula,
  parseFormula,
} from '../src/formula/index.ts';
import { safeParseBlock } from '../src/index.ts';
import {
  BlockActionError,
  type BlockStateByType,
  createMemoryBlockStateHost,
  initialBlockState,
  pollResults,
  type ReducibleBlock,
  readBlockState,
  reduceBlockState,
  restoreBlockState,
  stateKey,
} from '../src/interactive/index.ts';

/** Validates a fixture with the real block schema, so tests use real blocks. */
function block<T extends ReducibleBlock['type']>(input: Record<string, unknown> & { type: T }) {
  const result = safeParseBlock(input);
  expect(result.issues).toEqual([]);
  return result.data as Extract<ReducibleBlock, { type: T }>;
}

const n = (value: number): NumberFormula => ({ op: 'num', value });
const v = (name: string): NumberFormula => ({ op: 'var', name });

const POLL = block({
  type: 'poll',
  id: 'favorite',
  question: 'Favorite kind?',
  options: [
    { id: 'decks', label: 'Decks' },
    { id: 'pages', label: 'Pages' },
    { id: 'apps', label: 'Apps' },
  ],
});
const QUIZ = block({
  type: 'quiz',
  id: 'check',
  passScore: 0.5,
  questions: [
    {
      id: 'q1',
      prompt: 'Tone or CSS?',
      choices: [
        { id: 'tone', label: 'Tone' },
        { id: 'css', label: 'CSS' },
      ],
      answers: ['tone'],
    },
    {
      id: 'q2',
      prompt: 'Containers?',
      choices: [
        { id: 'tabs', label: 'Tabs' },
        { id: 'poll', label: 'Poll' },
        { id: 'reveal', label: 'Reveal' },
      ],
      answers: ['tabs', 'reveal'],
    },
  ],
});
const CALCULATOR = block({
  type: 'calculator',
  id: 'pricing',
  inputs: [
    { name: 'seats', label: 'Seats', min: 1, max: 100, step: 1, default: 10 },
    { name: 'discount', label: 'Discount', min: 0, max: 0.5, step: 0.05, default: 0 },
  ],
  outputs: [
    {
      id: 'monthly',
      label: 'Per month',
      unit: 'cents',
      formula: {
        op: 'mul',
        left: { op: 'mul', left: v('seats'), right: n(1200) },
        right: { op: 'sub', left: n(1), right: v('discount') },
      },
    },
    { id: 'ratio', label: 'Ratio', formula: { op: 'div', left: n(1), right: v('discount') } },
  ],
  chart: { output: 'monthly', input: 'seats', points: 5 },
});
const COUNTER = block({
  type: 'counter',
  id: 'claps',
  label: 'Claps',
  start: 1,
  step: 2,
  min: 0,
  max: 5,
});
const TABS = block({
  type: 'tabs',
  id: 'plans',
  label: 'Plans',
  panels: [
    { id: 'solo', label: 'Solo', blocks: [{ type: 'divider' }] },
    { id: 'team', label: 'Team', blocks: [{ type: 'divider' }] },
  ],
});
const REVEAL = block({
  type: 'reveal',
  id: 'answer',
  label: 'Show',
  blocks: [{ type: 'divider' }],
});
const CHART = block({
  type: 'chart-controls',
  id: 'growth',
  spec: {
    kind: 'line',
    title: 'Signups',
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    series: [
      { label: 'Organic', values: [1, 2, 3, 4] },
      { label: 'Paid', values: [5, 6, 7, 8] },
    ],
  },
  kinds: ['line', 'bar'],
  seriesToggle: true,
  range: true,
});

function refused<B extends ReducibleBlock>(
  target: B,
  state: BlockStateByType[B['type']],
  action: unknown
): string {
  const result = reduceBlockState(target, state, action);
  expect(result.ok, JSON.stringify(action)).toBe(false);
  return result.ok ? '' : result.error;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('block state: initial states', () => {
  it('starts every reducible block from its definition', () => {
    expect(initialBlockState(POLL)).toEqual({ votes: {} });
    expect(initialBlockState(QUIZ)).toEqual({ answers: {}, submitted: {} });
    expect(initialBlockState(CALCULATOR)).toEqual({ values: {} });
    expect(initialBlockState(COUNTER)).toEqual({ value: 1 });
    expect(initialBlockState(TABS)).toEqual({ panel: 'solo' });
    expect(initialBlockState(block({ ...TABS, defaultPanel: 'team' }))).toEqual({ panel: 'team' });
    expect(initialBlockState(REVEAL)).toEqual({ open: false });
    expect(initialBlockState(CHART)).toEqual({ kind: 'line', hidden: [], range: null });
  });
});

describe('block state: reducers are pure and deterministic', () => {
  const cases: [string, ReducibleBlock, unknown][] = [
    ['poll vote', POLL, { type: 'vote', viewer: 'ada', options: ['decks'] }],
    ['poll clear', POLL, { type: 'clear-vote', viewer: 'ada' }],
    ['quiz answer', QUIZ, { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] }],
    ['quiz reset', QUIZ, { type: 'reset', viewer: 'ada' }],
    ['calculator set', CALCULATOR, { type: 'set', name: 'seats', value: 42 }],
    ['calculator reset', CALCULATOR, { type: 'reset' }],
    ['counter up', COUNTER, { type: 'increment' }],
    ['counter down', COUNTER, { type: 'decrement' }],
    ['tabs select', TABS, { type: 'select', panel: 'team' }],
    ['reveal toggle', REVEAL, { type: 'toggle' }],
    ['chart kind', CHART, { type: 'set-kind', kind: 'bar' }],
    ['chart series', CHART, { type: 'toggle-series', index: 1 }],
    ['chart range', CHART, { type: 'set-range', range: [1, 3] }],
    ['refused action', POLL, { type: 'vote', viewer: 'ada', options: ['nope'] }],
  ];

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('reducers must not use Math.random');
    });
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('reducers must not read the clock');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('every reducer: same input gives the same output and nothing is mutated', () => {
    for (const [_name, target, action] of cases) {
      const state = deepFreeze(structuredClone(initialBlockState(target)));
      const frozenBlock = deepFreeze(structuredClone(target));
      const frozenAction = deepFreeze(structuredClone(action));
      const first = reduceBlockState(frozenBlock, state, frozenAction);
      const second = reduceBlockState(frozenBlock, state, frozenAction);
      expect(second).toEqual(first);
      expect(state).toEqual(initialBlockState(target));
    }
  });
});

describe('block state: actions that do not fit are refused', () => {
  it('refuses every action that does not fit', () => {
    for (const [_name, target, action] of [
      ['not an object', POLL, 'vote'],
      ['null', POLL, null],
      ['another block type action', POLL, { type: 'increment' }],
      ['an extra key', COUNTER, { type: 'increment', by: 100 }],
      ['a missing viewer', POLL, { type: 'vote', options: ['decks'] }],
      ['a __proto__ viewer', POLL, { type: 'vote', viewer: '__proto__', options: ['decks'] }],
      ['a constructor viewer', QUIZ, { type: 'submit', viewer: 'constructor' }],
      ['a viewer with spaces', POLL, { type: 'vote', viewer: 'a b', options: ['decks'] }],
      [
        'a non-finite value',
        CALCULATOR,
        { type: 'set', name: 'seats', value: Number.POSITIVE_INFINITY },
      ],
      ['a NaN value', CALCULATOR, { type: 'set', name: 'seats', value: Number.NaN }],
    ] as readonly [string, ReducibleBlock, unknown][]) {
      expect(refused(target, initialBlockState(target), action)).toMatch(/^Invalid /);
    }
  });
});

describe('poll', () => {
  it('never reads inherited properties as votes', () => {
    expect(pollResults(POLL, initialBlockState(POLL), 'constructor').mine).toBeNull();
    expect(pollResults(POLL, initialBlockState(POLL), 'toString').mine).toBeNull();
  });
});

describe('restoring untrusted state', () => {
  it('restores every kind of untrusted state as the initial state', () => {
    for (const [_name, target, raw] of [
      ['garbage', POLL, 'not state'],
      ['null', QUIZ, null],
      ['the wrong shape', COUNTER, { value: 'many' }],
      ['extra keys', REVEAL, { open: true, script: 'x' }],
      ['a __proto__ viewer', POLL, JSON.parse('{"votes":{"__proto__":["decks"]}}')],
      [
        'too many viewers',
        POLL,
        { votes: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`v${i}`, ['decks']])) },
      ],
    ] as readonly [string, ReducibleBlock, unknown][]) {
      expect(restoreBlockState(target, raw)).toEqual(initialBlockState(target));
    }
  });
});

describe('BlockStateHost', () => {
  it('dispatches through the reducers, notifies subscribers and resolves with the state', async () => {
    const host = createMemoryBlockStateHost();
    const key = stateKey('deck', POLL.id);
    const seen: unknown[] = [];
    const unsubscribe = host.subscribe(key, (state) => seen.push(state));
    const state = await host.dispatch(key, POLL, {
      type: 'vote',
      viewer: 'ada',
      options: ['decks'],
    });
    expect(state).toEqual({ votes: { ada: ['decks'] } });
    expect(readBlockState(host, key, POLL)).toEqual(state);
    expect(seen).toEqual([state]);
    unsubscribe();
    await host.dispatch(key, POLL, { type: 'vote', viewer: 'marco', options: ['apps'] });
    expect(seen).toHaveLength(1);
    expect(host.entries()).toHaveLength(1);
  });

  it('rejects refused actions with a BlockActionError and keeps the state', async () => {
    const host = createMemoryBlockStateHost();
    const key = stateKey('deck', COUNTER.id);
    await host.dispatch(key, COUNTER, { type: 'increment' });
    const failure = host.dispatch(key, COUNTER, { type: 'increment', by: 9 });
    await expect(failure).rejects.toBeInstanceOf(BlockActionError);
    await expect(host.dispatch(key, COUNTER, { type: 'increment' })).resolves.toEqual({ value: 5 });
    await expect(host.dispatch(key, COUNTER, { type: 'increment' })).rejects.toThrow(/maximum/);
    expect(readBlockState(host, key, COUNTER)).toEqual({ value: 5 });
  });
});

// --- merged from formula.test.ts ---
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

describe('formula source safety', () => {
  it('re-exports Texuli formula and keeps Zod adapters free of eval', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'formula');
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(files).toEqual(['index.ts', 'zod.ts']);
    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8');
      expect(text, name).not.toMatch(/\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
    expect(readFileSync(join(dir, 'index.ts'), 'utf8')).toContain('@texuli/blocks/formula');
  });
});
