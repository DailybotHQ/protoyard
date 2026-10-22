// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Block, safeParseBlock } from '../src/index.ts';
import {
  BLOCK_STATE_LIMITS,
  BlockActionError,
  type BlockStateByType,
  calculatorChart,
  calculatorOutputs,
  calculatorValues,
  chartControlsSpec,
  createMemoryBlockStateHost,
  initialBlockState,
  isReducibleBlock,
  type PollState,
  parseStateKey,
  pollResults,
  type QuizState,
  quizChoiceOrder,
  quizScore,
  REDUCIBLE_BLOCK_TYPES,
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

const n = (value: number) => ({ op: 'num' as const, value });
const v = (name: string) => ({ op: 'var' as const, name });

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
const MULTI_POLL = block({ ...POLL, id: 'many', maxChoices: 2 });
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
const QUIZ_AT_END = block({ ...QUIZ, id: 'exam', feedback: 'end' });
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

/** Applies actions in order, asserting each succeeds. */
function apply<B extends ReducibleBlock>(
  target: B,
  ...actions: unknown[]
): BlockStateByType[B['type']] {
  let state = initialBlockState(target);
  for (const action of actions) {
    const result = reduceBlockState(target, state, action);
    if (!result.ok) throw new Error(`${JSON.stringify(action)}: ${result.error}`);
    state = result.state;
  }
  return state;
}

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

  it('knows which blocks it reduces', () => {
    expect(REDUCIBLE_BLOCK_TYPES).toHaveLength(7);
    expect(isReducibleBlock(POLL)).toBe(true);
    expect(isReducibleBlock({ type: 'form' })).toBe(false);
    expect(isReducibleBlock({ type: 'heading' })).toBe(false);
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

  it.each(cases)(
    '%s: same input gives the same output and nothing is mutated',
    (_name, target, action) => {
      const state = deepFreeze(structuredClone(initialBlockState(target)));
      const frozenBlock = deepFreeze(structuredClone(target));
      const frozenAction = deepFreeze(structuredClone(action));
      const first = reduceBlockState(frozenBlock, state, frozenAction);
      const second = reduceBlockState(frozenBlock, state, frozenAction);
      expect(second).toEqual(first);
      expect(state).toEqual(initialBlockState(target));
    }
  );

  it('derived views are pure too', () => {
    const poll = deepFreeze(apply(POLL, { type: 'vote', viewer: 'ada', options: ['decks'] }));
    expect(pollResults(POLL, poll, 'ada')).toEqual(pollResults(POLL, poll, 'ada'));
    const quiz = deepFreeze(
      apply(QUIZ, { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] })
    );
    expect(quizScore(QUIZ, quiz, 'ada')).toEqual(quizScore(QUIZ, quiz, 'ada'));
    const calc = deepFreeze(apply(CALCULATOR));
    expect(calculatorOutputs(CALCULATOR, calc)).toEqual(calculatorOutputs(CALCULATOR, calc));
    expect(quizChoiceOrder(block({ ...QUIZ, shuffle: true }), 'q2')).toHaveLength(3);
  });
});

describe('block state: actions that do not fit are refused', () => {
  it.each<[string, ReducibleBlock, unknown]>([
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
  ])('refuses %s', (_name, target, action) => {
    expect(refused(target, initialBlockState(target), action)).toMatch(/^Invalid /);
  });
});

describe('poll', () => {
  it('records, changes and clears votes per viewer, with an aggregate', () => {
    let state = apply(
      POLL,
      { type: 'vote', viewer: 'ada', options: ['decks'] },
      { type: 'vote', viewer: 'marco', options: ['pages'] },
      { type: 'vote', viewer: 'lin', options: ['decks'] }
    );
    expect(pollResults(POLL, state, 'ada')).toEqual({
      options: [
        { id: 'decks', label: 'Decks', votes: 2, share: 2 / 3 },
        { id: 'pages', label: 'Pages', votes: 1, share: 1 / 3 },
        { id: 'apps', label: 'Apps', votes: 0, share: 0 },
      ],
      voters: 3,
      mine: ['decks'],
    });
    const changed = reduceBlockState(POLL, state, {
      type: 'vote',
      viewer: 'ada',
      options: ['apps'],
    });
    expect(changed.ok && pollResults(POLL, changed.state, 'ada').mine).toEqual(['apps']);
    state = apply(
      POLL,
      { type: 'vote', viewer: 'ada', options: ['decks'] },
      { type: 'clear-vote', viewer: 'ada' }
    );
    expect(pollResults(POLL, state, 'ada')).toMatchObject({ voters: 0, mine: null });
    expect(pollResults(POLL, initialBlockState(POLL)).mine).toBeNull();
  });

  it('refuses unknown, repeated or too many options', () => {
    const state = initialBlockState(POLL);
    expect(refused(POLL, state, { type: 'vote', viewer: 'ada', options: ['nope'] })).toMatch(
      /not an option/
    );
    expect(
      refused(MULTI_POLL, state, { type: 'vote', viewer: 'ada', options: ['decks', 'decks'] })
    ).toMatch(/once/);
    expect(
      refused(POLL, state, { type: 'vote', viewer: 'ada', options: ['decks', 'pages'] })
    ).toMatch(/at most 1 option$/);
    expect(
      apply(MULTI_POLL, { type: 'vote', viewer: 'ada', options: ['decks', 'apps'] }).votes.ada
    ).toEqual(['decks', 'apps']);
    expect(
      refused(MULTI_POLL, state, {
        type: 'vote',
        viewer: 'ada',
        options: ['decks', 'pages', 'apps'],
      })
    ).toMatch(/at most 2 options/);
  });

  it('caps the number of viewers but lets existing viewers change their vote', () => {
    const votes: PollState['votes'] = {};
    for (let i = 0; i < BLOCK_STATE_LIMITS.viewers; i += 1) votes[`v${i}`] = ['decks'];
    const full = { votes };
    expect(refused(POLL, full, { type: 'vote', viewer: 'late', options: ['apps'] })).toMatch(
      /viewer limit/
    );
    expect(reduceBlockState(POLL, full, { type: 'vote', viewer: 'v0', options: ['apps'] }).ok).toBe(
      true
    );
  });

  it('never reads inherited properties as votes', () => {
    expect(pollResults(POLL, initialBlockState(POLL), 'constructor').mine).toBeNull();
    expect(pollResults(POLL, initialBlockState(POLL), 'toString').mine).toBeNull();
  });
});

describe('quiz', () => {
  it('scores answers per viewer, with exact sets for multiple answers', () => {
    const state = apply(
      QUIZ,
      { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] },
      { type: 'answer', viewer: 'ada', question: 'q2', choices: ['reveal', 'tabs'] },
      { type: 'answer', viewer: 'marco', question: 'q2', choices: ['tabs'] }
    );
    expect(quizScore(QUIZ, state, 'ada')).toEqual({
      questions: [
        { id: 'q1', answered: true, correct: true },
        { id: 'q2', answered: true, correct: true },
      ],
      answered: 2,
      correct: 2,
      total: 2,
      ratio: 1,
      passed: true,
      submitted: false,
    });
    expect(quizScore(QUIZ, state, 'marco')).toMatchObject({
      answered: 1,
      correct: 0,
      ratio: 0,
      passed: false,
    });
    expect(
      quizScore(block({ ...QUIZ, id: 'nopass', passScore: undefined }), state, 'ada').passed
    ).toBeNull();
    expect(quizScore(QUIZ, state, 'nobody')).toMatchObject({ answered: 0, correct: 0 });
  });

  it('locks a question once answered with immediate feedback, but not with feedback at the end', () => {
    const state = apply(QUIZ, { type: 'answer', viewer: 'ada', question: 'q1', choices: ['css'] });
    expect(
      refused(QUIZ, state, { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] })
    ).toMatch(/already answered/);
    const exam = apply(
      QUIZ_AT_END,
      { type: 'answer', viewer: 'ada', question: 'q1', choices: ['css'] },
      { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] }
    );
    expect((exam.answers.ada as Record<string, string[]>).q1).toEqual(['tone']);
  });

  it('submits, locks and resets', () => {
    expect(refused(QUIZ, initialBlockState(QUIZ), { type: 'submit', viewer: 'ada' })).toMatch(
      /at least one/
    );
    let state: QuizState = apply(
      QUIZ_AT_END,
      { type: 'answer', viewer: 'ada', question: 'q1', choices: ['tone'] },
      { type: 'submit', viewer: 'ada' }
    );
    expect(quizScore(QUIZ_AT_END, state, 'ada').submitted).toBe(true);
    expect(
      refused(QUIZ_AT_END, state, {
        type: 'answer',
        viewer: 'ada',
        question: 'q2',
        choices: ['tabs'],
      })
    ).toMatch(/Already submitted/);
    expect(refused(QUIZ_AT_END, state, { type: 'submit', viewer: 'ada' })).toMatch(
      /Already submitted/
    );
    const reset = reduceBlockState(QUIZ_AT_END, state, { type: 'reset', viewer: 'ada' });
    expect(reset.ok).toBe(true);
    if (reset.ok) state = reset.state;
    expect(state).toEqual({ answers: {}, submitted: {} });
  });

  it('refuses unknown questions and choices, repeats, and two choices for a single answer', () => {
    const state = initialBlockState(QUIZ);
    expect(
      refused(QUIZ, state, { type: 'answer', viewer: 'ada', question: 'q9', choices: ['tone'] })
    ).toMatch(/not a question/);
    expect(
      refused(QUIZ, state, { type: 'answer', viewer: 'ada', question: 'q1', choices: ['nope'] })
    ).toMatch(/not a choice/);
    expect(
      refused(QUIZ, state, {
        type: 'answer',
        viewer: 'ada',
        question: 'q1',
        choices: ['tone', 'css'],
      })
    ).toMatch(/Choose one answer/);
    expect(
      refused(QUIZ, state, {
        type: 'answer',
        viewer: 'ada',
        question: 'q2',
        choices: ['tabs', 'tabs'],
      })
    ).toMatch(/once/);
  });

  it('orders choices as authored, or with a seeded shuffle that is the same every time', () => {
    expect(quizChoiceOrder(QUIZ, 'q2')).toEqual(['tabs', 'poll', 'reveal']);
    const shuffled = block({ ...QUIZ, id: 'shuffled', shuffle: true });
    const order = quizChoiceOrder(shuffled, 'q2');
    expect([...order].sort()).toEqual(['poll', 'reveal', 'tabs']);
    expect(quizChoiceOrder(shuffled, 'q2')).toEqual(order);
    const orders = new Set(
      Array.from({ length: 12 }, (_, i) =>
        quizChoiceOrder(block({ ...shuffled, id: `quiz-${i}` }), 'q2').join()
      )
    );
    expect(orders.size).toBeGreaterThan(1);
    expect(quizChoiceOrder(shuffled, 'missing')).toEqual([]);
  });
});

describe('calculator', () => {
  it('sets inputs on the step grid and computes outputs and the chart', () => {
    const state = apply(
      CALCULATOR,
      { type: 'set', name: 'seats', value: 20.4 },
      { type: 'set', name: 'discount', value: 0.1 }
    );
    expect(state.values).toEqual({ seats: 20, discount: 0.1 });
    expect(calculatorValues(CALCULATOR, state)).toEqual({ seats: 20, discount: 0.1 });
    expect(calculatorOutputs(CALCULATOR, state)).toEqual([
      { id: 'monthly', label: 'Per month', value: 21600 },
      { id: 'ratio', label: 'Ratio', value: 10 },
    ]);
    expect(calculatorChart(CALCULATOR, state)).toEqual({
      x: [1, 25.75, 50.5, 75.25, 100],
      y: [1080, 27810, 54540, 81270, 108000],
    });
  });

  it('uses defaults until set, gives null for undefined results, and resets', () => {
    const initial = initialBlockState(CALCULATOR);
    expect(calculatorValues(CALCULATOR, initial)).toEqual({ seats: 10, discount: 0 });
    expect(calculatorOutputs(CALCULATOR, initial)[1]?.value).toBeNull();
    expect(apply(CALCULATOR, { type: 'set', name: 'seats', value: 5 }, { type: 'reset' })).toEqual({
      values: {},
    });
    expect(
      calculatorChart(block({ ...CALCULATOR, id: 'nochart', chart: undefined }), initial)
    ).toBeNull();
  });

  it('refuses unknown inputs and values out of range', () => {
    const state = initialBlockState(CALCULATOR);
    expect(refused(CALCULATOR, state, { type: 'set', name: 'price', value: 5 })).toMatch(
      /not an input/
    );
    expect(refused(CALCULATOR, state, { type: 'set', name: 'seats', value: 101 })).toMatch(
      /between 1 and 100/
    );
    expect(refused(CALCULATOR, state, { type: 'set', name: 'seats', value: 0 })).toMatch(
      /between 1 and 100/
    );
  });
});

describe('counter, tabs and reveal', () => {
  it('counts by step within bounds and resets to start', () => {
    expect(apply(COUNTER, { type: 'increment' }, { type: 'increment' })).toEqual({ value: 5 });
    expect(refused(COUNTER, { value: 5 }, { type: 'increment' })).toMatch(/maximum/);
    expect(refused(COUNTER, { value: 1 }, { type: 'decrement' })).toMatch(/minimum/);
    expect(apply(COUNTER, { type: 'increment' }, { type: 'reset' })).toEqual({ value: 1 });
  });

  it('selects known tab panels only', () => {
    expect(apply(TABS, { type: 'select', panel: 'team' })).toEqual({ panel: 'team' });
    expect(refused(TABS, initialBlockState(TABS), { type: 'select', panel: 'enterprise' })).toMatch(
      /not a panel/
    );
  });

  it('toggles and sets a reveal', () => {
    expect(apply(REVEAL, { type: 'toggle' })).toEqual({ open: true });
    expect(apply(REVEAL, { type: 'toggle' }, { type: 'toggle' })).toEqual({ open: false });
    expect(apply(REVEAL, { type: 'set-open', open: true })).toEqual({ open: true });
  });
});

describe('chart with controls', () => {
  it('switches kinds, hides series and narrows the range, and derives the spec', () => {
    const state = apply(
      CHART,
      { type: 'set-kind', kind: 'bar' },
      { type: 'toggle-series', index: 0 },
      { type: 'set-range', range: [1, 2] }
    );
    expect(state).toEqual({ kind: 'bar', hidden: [0], range: [1, 2] });
    expect(chartControlsSpec(CHART, state)).toEqual({
      kind: 'bar',
      title: 'Signups',
      labels: ['Feb', 'Mar'],
      series: [{ label: 'Paid', values: [6, 7] }],
    });
    expect(
      apply(CHART, { type: 'toggle-series', index: 0 }, { type: 'toggle-series', index: 0 }).hidden
    ).toEqual([]);
    expect(
      apply(CHART, { type: 'set-range', range: [0, 1] }, { type: 'set-range', range: null }).range
    ).toBeNull();
    expect(apply(CHART, { type: 'set-kind', kind: 'bar' }, { type: 'reset' })).toEqual(
      initialBlockState(CHART)
    );
  });

  it('refuses controls the block does not offer or values that do not fit', () => {
    const state = initialBlockState(CHART);
    expect(refused(CHART, state, { type: 'set-kind', kind: 'pie' })).toMatch(
      /cannot be shown as pie/
    );
    expect(refused(CHART, { ...state, hidden: [0] }, { type: 'toggle-series', index: 1 })).toMatch(
      /at least one/
    );
    expect(refused(CHART, state, { type: 'toggle-series', index: 5 })).toMatch(/No such series/);
    expect(refused(CHART, state, { type: 'set-range', range: [2, 2] })).toMatch(
      /at least two labels/
    );
    expect(refused(CHART, state, { type: 'set-range', range: [0, 4] })).toMatch(
      /at least two labels/
    );
    const plain = block({ ...CHART, id: 'plain', kinds: undefined, seriesToggle: undefined });
    expect(refused(plain, initialBlockState(plain), { type: 'set-kind', kind: 'bar' })).toMatch(
      /does not let/
    );
    expect(refused(plain, initialBlockState(plain), { type: 'toggle-series', index: 0 })).toMatch(
      /does not let/
    );
  });
});

describe('restoring untrusted state', () => {
  it.each<[string, ReducibleBlock, unknown]>([
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
  ])('restores %s as the initial state', (_name, target, raw) => {
    expect(restoreBlockState(target, raw)).toEqual(initialBlockState(target));
  });

  it('drops entries the definition no longer has', () => {
    expect(
      restoreBlockState(POLL, {
        votes: { ada: ['decks', 'gone'], marco: ['gone'], lin: ['decks', 'apps'] },
      })
    ).toEqual({
      votes: { ada: ['decks'] },
    });
    expect(
      restoreBlockState(QUIZ, {
        answers: {
          ada: { q1: ['tone', 'css'], q2: ['tabs', 'gone'], q9: ['x'] },
          marco: { q9: ['x'] },
        },
        submitted: { ada: true, marco: true },
      })
    ).toEqual({ answers: { ada: { q2: ['tabs'] } }, submitted: { ada: true } });
    expect(
      restoreBlockState(CALCULATOR, { values: { seats: 500, discount: 0.2, price: 3 } })
    ).toEqual({
      values: { discount: 0.2 },
    });
    expect(restoreBlockState(COUNTER, { value: 99 })).toEqual({ value: 1 });
    expect(restoreBlockState(TABS, { panel: 'gone' })).toEqual({ panel: 'solo' });
    expect(restoreBlockState(CHART, { kind: 'pie', hidden: [0, 1, 7], range: [3, 1] })).toEqual({
      kind: 'line',
      hidden: [],
      range: null,
    });
    expect(restoreBlockState(CHART, { kind: 'bar', hidden: [1], range: [0, 2] })).toEqual({
      kind: 'bar',
      hidden: [1],
      range: [0, 2],
    });
  });
});

describe('BlockStateHost', () => {
  it('builds and parses state keys', () => {
    expect(stateKey('launch-deck', 'favorite')).toBe('launch-deck/favorite');
    expect(stateKey('bp-ab12cd', 'q1')).toBe('bp-ab12cd/q1');
    expect(parseStateKey('launch-deck/favorite')).toEqual({
      documentId: 'launch-deck',
      blockId: 'favorite',
    });
    for (const [doc, id] of [
      ['', 'favorite'],
      ['a/b', 'favorite'],
      ['../x', 'favorite'],
      ['deck', 'Favorite'],
      ['deck', ''],
    ] as const) {
      expect(() => stateKey(doc, id), `${doc}/${id}`).toThrow(RangeError);
    }
    expect(parseStateKey('nokey')).toBeNull();
    expect(parseStateKey('deck/Bad Id')).toBeNull();
  });

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

  it('isolates a failing subscriber', async () => {
    const host = createMemoryBlockStateHost();
    const key = stateKey('deck', REVEAL.id);
    const calls: string[] = [];
    host.subscribe(key, () => {
      calls.push('broken');
      throw new Error('subscriber bug');
    });
    host.subscribe(key, () => calls.push('fine'));
    await expect(host.dispatch(key, REVEAL, { type: 'toggle' })).resolves.toEqual({ open: true });
    expect(calls).toEqual(['broken', 'fine']);
  });

  it('restores untrusted initial states on read', async () => {
    const key = stateKey('deck', TABS.id);
    const host = createMemoryBlockStateHost({ initial: { [key]: { panel: '<script>' } } });
    expect(readBlockState(host, key, TABS)).toEqual({ panel: 'solo' });
    await expect(host.dispatch(key, TABS, { type: 'select', panel: 'team' })).resolves.toEqual({
      panel: 'team',
    });
  });

  it('works for every reducible block in the schema', () => {
    const blocks: Block[] = [POLL, QUIZ, CALCULATOR, COUNTER, TABS, REVEAL, CHART];
    expect(blocks.map((b) => b.type).sort()).toEqual([...REDUCIBLE_BLOCK_TYPES].sort());
  });
});
