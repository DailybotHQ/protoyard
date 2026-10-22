import type { AiChartSpec } from '@protoyard/ai';
import { z } from 'zod';
import { evaluateFormula } from '../formula/evaluate.ts';
import type {
  CalculatorBlock,
  ChartControlsBlock,
  CounterBlock,
  PollBlock,
  QuizBlock,
  RevealBlock,
  TabsBlock,
} from '../schema/index.ts';
import {
  BLOCK_STATE_LIMITS,
  BLOCK_STATE_SCHEMAS,
  type BlockStateByType,
  type CalculatorState,
  type ChartControlsState,
  type CounterState,
  initialBlockState,
  type PollState,
  type QuizState,
  type ReducibleBlock,
  type ReducibleBlockType,
  type RevealState,
  type TabsState,
  ViewerIdSchema,
} from './state.ts';

/**
 * Pure reducers: `(block, state, action) → { ok, state } | { ok: false, error }`.
 * They never mutate their inputs, never throw, never read the clock or a
 * random source, and refuse any action that does not fit the block's
 * definition. The kind runtime calls them inside its service, so a refused
 * action changes nothing.
 */

const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);

export const PollActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('vote'),
    viewer: ViewerIdSchema,
    options: z.array(id).min(1).max(8),
  }),
  z.strictObject({ type: z.literal('clear-vote'), viewer: ViewerIdSchema }),
]);

export const QuizActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('answer'),
    viewer: ViewerIdSchema,
    question: id,
    choices: z.array(id).min(1).max(6),
  }),
  z.strictObject({ type: z.literal('submit'), viewer: ViewerIdSchema }),
  z.strictObject({ type: z.literal('reset'), viewer: ViewerIdSchema }),
]);

export const CalculatorActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('set'),
    name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/),
    value: z.number().finite(),
  }),
  z.strictObject({ type: z.literal('reset') }),
]);

export const CounterActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('increment') }),
  z.strictObject({ type: z.literal('decrement') }),
  z.strictObject({ type: z.literal('reset') }),
]);

export const TabsActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), panel: id }),
]);

export const RevealActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('toggle') }),
  z.strictObject({ type: z.literal('set-open'), open: z.boolean() }),
]);

export const ChartControlsActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('set-kind'),
    kind: z.enum(['line', 'area', 'bar', 'donut', 'pie', 'funnel']),
  }),
  z.strictObject({ type: z.literal('toggle-series'), index: z.number().int().min(0).max(7) }),
  z.strictObject({
    type: z.literal('set-range'),
    range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable(),
  }),
  z.strictObject({ type: z.literal('reset') }),
]);

export type PollAction = z.infer<typeof PollActionSchema>;
export type QuizAction = z.infer<typeof QuizActionSchema>;
export type CalculatorAction = z.infer<typeof CalculatorActionSchema>;
export type CounterAction = z.infer<typeof CounterActionSchema>;
export type TabsAction = z.infer<typeof TabsActionSchema>;
export type RevealAction = z.infer<typeof RevealActionSchema>;
export type ChartControlsAction = z.infer<typeof ChartControlsActionSchema>;

export interface BlockActionByType {
  poll: PollAction;
  quiz: QuizAction;
  calculator: CalculatorAction;
  counter: CounterAction;
  tabs: TabsAction;
  reveal: RevealAction;
  'chart-controls': ChartControlsAction;
}

export type BlockAction = BlockActionByType[ReducibleBlockType];

export const BLOCK_ACTION_SCHEMAS = Object.freeze({
  poll: PollActionSchema,
  quiz: QuizActionSchema,
  calculator: CalculatorActionSchema,
  counter: CounterActionSchema,
  tabs: TabsActionSchema,
  reveal: RevealActionSchema,
  'chart-controls': ChartControlsActionSchema,
} satisfies { [K in ReducibleBlockType]: z.ZodType<BlockActionByType[K]> });

export type ReduceResult<S> = { ok: true; state: S } | { ok: false; error: string };

const ok = <S>(state: S): ReduceResult<S> => ({ ok: true, state });
const fail = <S>(error: string): ReduceResult<S> => ({ ok: false, error });
const has = (record: object, key: string) => Object.hasOwn(record, key);

/** A copy of `record` without `key`. */
function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const copy: Record<string, T> = {};
  for (const [k, value] of Object.entries(record)) if (k !== key) copy[k] = value;
  return copy;
}

/** A copy of `record` with `key` set, refusing a new key past the viewer cap. */
function withViewer<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T
): Record<string, T> | null {
  if (!has(record, key) && Object.keys(record).length >= BLOCK_STATE_LIMITS.viewers) return null;
  return { ...record, [key]: value };
}

// ── poll ──────────────────────────────────────────────────────────────────

function reducePoll(
  block: PollBlock,
  state: PollState,
  action: PollAction
): ReduceResult<PollState> {
  if (action.type === 'clear-vote') {
    return has(state.votes, action.viewer)
      ? ok({ votes: without(state.votes, action.viewer) })
      : ok(state);
  }
  const known = new Set(block.options.map((option) => option.id));
  const max = block.maxChoices ?? 1;
  if (new Set(action.options).size !== action.options.length)
    return fail('Choose each option once');
  if (action.options.length > max)
    return fail(`Choose at most ${max} option${max === 1 ? '' : 's'}`);
  const unknown = action.options.find((option) => !known.has(option));
  if (unknown !== undefined) return fail(`"${unknown}" is not an option of this poll`);
  const votes = withViewer(state.votes, action.viewer, [...action.options]);
  return votes ? ok({ votes }) : fail('This poll has reached its viewer limit');
}

export interface PollResults {
  options: { id: string; label: string; votes: number; share: number }[];
  /** Viewers who voted. */
  voters: number;
  /** The viewer's own choice, or null before voting. */
  mine: string[] | null;
}

/** Aggregate counts plus the viewer's own vote. */
export function pollResults(block: PollBlock, state: PollState, viewer?: string): PollResults {
  const counts = new Map(block.options.map((option) => [option.id, 0]));
  let voters = 0;
  for (const choice of Object.values(state.votes)) {
    voters += 1;
    for (const option of choice)
      if (counts.has(option)) counts.set(option, (counts.get(option) ?? 0) + 1);
  }
  return {
    options: block.options.map((option) => {
      const votes = counts.get(option.id) ?? 0;
      return {
        id: option.id,
        label: option.label,
        votes,
        share: voters === 0 ? 0 : votes / voters,
      };
    }),
    voters,
    mine:
      viewer !== undefined && has(state.votes, viewer)
        ? [...(state.votes[viewer] as string[])]
        : null,
  };
}

// ── quiz ──────────────────────────────────────────────────────────────────

function reduceQuiz(
  block: QuizBlock,
  state: QuizState,
  action: QuizAction
): ReduceResult<QuizState> {
  const { viewer } = action;
  const submitted = has(state.submitted, viewer);
  const mine = has(state.answers, viewer)
    ? (state.answers[viewer] as Record<string, string[]>)
    : {};
  if (action.type === 'reset') {
    return ok({
      answers: without(state.answers, viewer),
      submitted: without(state.submitted, viewer),
    });
  }
  if (action.type === 'submit') {
    if (submitted) return fail('Already submitted; reset to try again');
    if (Object.keys(mine).length === 0) return fail('Answer at least one question first');
    const next = withViewer(state.submitted, viewer, true as const);
    return next
      ? ok({ answers: state.answers, submitted: next })
      : fail('This quiz has reached its viewer limit');
  }
  if (submitted) return fail('Already submitted; reset to answer again');
  const question = block.questions.find((q) => q.id === action.question);
  if (!question) return fail(`"${action.question}" is not a question of this quiz`);
  if ((block.feedback ?? 'immediate') === 'immediate' && has(mine, question.id)) {
    return fail('This question was already answered and its feedback shown');
  }
  const choices = new Set(question.choices.map((choice) => choice.id));
  if (new Set(action.choices).size !== action.choices.length)
    return fail('Choose each answer once');
  const unknown = action.choices.find((choice) => !choices.has(choice));
  if (unknown !== undefined) return fail(`"${unknown}" is not a choice of this question`);
  if (question.answers.length === 1 && action.choices.length > 1) return fail('Choose one answer');
  const answers = withViewer(state.answers, viewer, {
    ...mine,
    [question.id]: [...action.choices],
  });
  return answers
    ? ok({ answers, submitted: state.submitted })
    : fail('This quiz has reached its viewer limit');
}

export interface QuizScore {
  questions: { id: string; answered: boolean; correct: boolean }[];
  answered: number;
  correct: number;
  total: number;
  /** correct / total. */
  ratio: number;
  /** Whether the ratio meets `passScore`; null when the quiz has none. */
  passed: boolean | null;
  submitted: boolean;
}

/** One viewer's score. A multiple-answer question counts only when the sets match exactly. */
export function quizScore(block: QuizBlock, state: QuizState, viewer: string): QuizScore {
  const mine = has(state.answers, viewer)
    ? (state.answers[viewer] as Record<string, string[]>)
    : {};
  const questions = block.questions.map((question) => {
    const chosen = has(mine, question.id) ? (mine[question.id] as string[]) : null;
    const correct =
      chosen !== null &&
      chosen.length === question.answers.length &&
      question.answers.every((answer) => chosen.includes(answer));
    return { id: question.id, answered: chosen !== null, correct };
  });
  const correct = questions.filter((q) => q.correct).length;
  const total = questions.length;
  const ratio = total === 0 ? 0 : correct / total;
  return {
    questions,
    answered: questions.filter((q) => q.answered).length,
    correct,
    total,
    ratio,
    passed: block.passScore === undefined ? null : ratio >= block.passScore,
    submitted: has(state.submitted, viewer),
  };
}

/** 32-bit FNV-1a, for seeding. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The order to show a question's choices: as authored, or, with `shuffle`, a
 * Fisher–Yates shuffle seeded by the block and question ids. Every viewer and
 * every reload sees the same order.
 */
export function quizChoiceOrder(block: QuizBlock, questionId: string): string[] {
  const question = block.questions.find((q) => q.id === questionId);
  if (!question) return [];
  const order = question.choices.map((choice) => choice.id);
  if (!block.shuffle) return order;
  let seed = fnv1a(`${block.id}/${questionId}`) || 1;
  for (let i = order.length - 1; i > 0; i -= 1) {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j] as string, order[i] as string];
  }
  return order;
}

// ── calculator ────────────────────────────────────────────────────────────

/** Snaps to the input's step grid (from `min`), trimming binary noise. */
function snap(value: number, min: number, step: number | undefined): number {
  if (step === undefined) return value;
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toPrecision(12));
}

function reduceCalculator(
  block: CalculatorBlock,
  state: CalculatorState,
  action: CalculatorAction
): ReduceResult<CalculatorState> {
  if (action.type === 'reset') return ok({ values: {} });
  const input = block.inputs.find((i) => i.name === action.name);
  if (!input) return fail(`"${action.name}" is not an input of this calculator`);
  if (action.value < input.min || action.value > input.max) {
    return fail(`${input.label} must be between ${input.min} and ${input.max}`);
  }
  const value = Math.min(input.max, snap(action.value, input.min, input.step));
  return ok({ values: { ...state.values, [input.name]: value } });
}

/** Every input's current value: the viewer's, or the default. */
export function calculatorValues(
  block: CalculatorBlock,
  state: CalculatorState
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const input of block.inputs) {
    const own = has(state.values, input.name) ? state.values[input.name] : undefined;
    values[input.name] =
      typeof own === 'number' && own >= input.min && own <= input.max ? own : input.default;
  }
  return values;
}

/** Each output evaluated with the current values (null when undefined). */
export function calculatorOutputs(
  block: CalculatorBlock,
  state: CalculatorState
): { id: string; label: string; value: number | null }[] {
  const values = calculatorValues(block, state);
  return block.outputs.map((output) => ({
    id: output.id,
    label: output.label,
    value: evaluateFormula(output.formula, values),
  }));
}

/** The block's chart: one output over evenly spaced values of one input. */
export function calculatorChart(
  block: CalculatorBlock,
  state: CalculatorState
): { x: number[]; y: (number | null)[] } | null {
  if (!block.chart) return null;
  const { input: name, output: outputId, points = 20 } = block.chart;
  const input = block.inputs.find((i) => i.name === name);
  const output = block.outputs.find((o) => o.id === outputId);
  if (!input || !output) return null;
  const values = calculatorValues(block, state);
  const x: number[] = [];
  const y: (number | null)[] = [];
  for (let i = 0; i < points; i += 1) {
    const at = Number((input.min + ((input.max - input.min) * i) / (points - 1)).toPrecision(12));
    x.push(at);
    y.push(evaluateFormula(output.formula, { ...values, [name]: at }));
  }
  return { x, y };
}

// ── counter, tabs, reveal ─────────────────────────────────────────────────

function reduceCounter(
  block: CounterBlock,
  state: CounterState,
  action: CounterAction
): ReduceResult<CounterState> {
  if (action.type === 'reset') return ok({ value: block.start ?? 0 });
  const step = block.step ?? 1;
  const value = action.type === 'increment' ? state.value + step : state.value - step;
  if (block.max !== undefined && value > block.max) return fail(`${block.label} is at its maximum`);
  if (block.min !== undefined && value < block.min) return fail(`${block.label} is at its minimum`);
  return ok({ value });
}

function reduceTabs(
  block: TabsBlock,
  _state: TabsState,
  action: TabsAction
): ReduceResult<TabsState> {
  if (!block.panels.some((panel) => panel.id === action.panel)) {
    return fail(`"${action.panel}" is not a panel of these tabs`);
  }
  return ok({ panel: action.panel });
}

function reduceReveal(
  _block: RevealBlock,
  state: RevealState,
  action: RevealAction
): ReduceResult<RevealState> {
  return ok({ open: action.type === 'toggle' ? !state.open : action.open });
}

// ── chart with controls ───────────────────────────────────────────────────

function reduceChartControls(
  block: ChartControlsBlock,
  state: ChartControlsState,
  action: ChartControlsAction
): ReduceResult<ChartControlsState> {
  if (action.type === 'reset') return ok(initialBlockState(block));
  if (action.type === 'set-kind') {
    if (!block.kinds) return fail('This chart does not let viewers change its kind');
    if (!block.kinds.includes(action.kind))
      return fail(`This chart cannot be shown as ${action.kind}`);
    return ok({ ...state, kind: action.kind });
  }
  if (action.type === 'toggle-series') {
    if (!block.seriesToggle) return fail('This chart does not let viewers hide series');
    if (action.index >= block.spec.series.length) return fail('No such series');
    const hidden = state.hidden.includes(action.index)
      ? state.hidden.filter((index) => index !== action.index)
      : [...state.hidden, action.index].sort((a, b) => a - b);
    if (hidden.length >= block.spec.series.length) return fail('Keep at least one series visible');
    return ok({ ...state, hidden });
  }
  if (!block.range) return fail('This chart does not let viewers change its range');
  if (action.range === null) return ok({ ...state, range: null });
  const [start, end] = action.range;
  if (start >= end || end >= block.spec.labels.length) {
    return fail(`Choose a range of at least two labels within 0–${block.spec.labels.length - 1}`);
  }
  return ok({ ...state, range: [start, end] });
}

/** The chart spec to draw for the current state. */
export function chartControlsSpec(
  block: ChartControlsBlock,
  state: ChartControlsState
): AiChartSpec {
  const [start, end] = state.range ?? [0, block.spec.labels.length - 1];
  const kind = block.kinds?.includes(state.kind) ? state.kind : block.spec.kind;
  return {
    ...block.spec,
    kind,
    labels: block.spec.labels.slice(start, end + 1),
    series: block.spec.series
      .filter((_, i) => !state.hidden.includes(i))
      .map((series) => ({ ...series, values: series.values.slice(start, end + 1) })),
  };
}

// ── dispatch ──────────────────────────────────────────────────────────────

type Reducer<K extends ReducibleBlockType> = (
  block: Extract<ReducibleBlock, { type: K }>,
  state: BlockStateByType[K],
  action: BlockActionByType[K]
) => ReduceResult<BlockStateByType[K]>;

const REDUCERS: { [K in ReducibleBlockType]: Reducer<K> } = {
  poll: reducePoll,
  quiz: reduceQuiz,
  calculator: reduceCalculator,
  counter: reduceCounter,
  tabs: reduceTabs,
  reveal: reduceReveal,
  'chart-controls': reduceChartControls,
};

/**
 * Applies `action` to `block`'s state. The action is untrusted and validated
 * here; `state` should come from `restoreBlockState` or a previous reduce.
 */
export function reduceBlockState<B extends ReducibleBlock>(
  block: B,
  state: BlockStateByType[B['type']],
  action: unknown
): ReduceResult<BlockStateByType[B['type']]> {
  const schema = BLOCK_ACTION_SCHEMAS[block.type] as unknown as z.ZodType<
    BlockActionByType[B['type']]
  >;
  const parsed = schema.safeParse(action);
  if (!parsed.success) {
    return fail(
      `Invalid ${block.type} action: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`
    );
  }
  const reducer = REDUCERS[block.type] as unknown as Reducer<B['type']>;
  return reducer(block as never, state, parsed.data);
}

/**
 * Turns persisted, untrusted state into valid state for `block`: the wrong
 * shape gives the initial state, and entries the definition no longer has
 * (a removed option, question, input, panel or series) are dropped.
 */
export function restoreBlockState<B extends ReducibleBlock>(
  block: B,
  raw: unknown
): BlockStateByType[B['type']] {
  const initial = initialBlockState(block);
  const parsed = (BLOCK_STATE_SCHEMAS[block.type] as z.ZodType).safeParse(raw);
  if (!parsed.success) return initial;
  const state = parsed.data as BlockStateByType[ReducibleBlockType];
  switch (block.type) {
    case 'poll': {
      const known = new Set(block.options.map((option) => option.id));
      const max = block.maxChoices ?? 1;
      const votes: Record<string, string[]> = {};
      for (const [viewer, choice] of Object.entries((state as PollState).votes)) {
        const valid = [...new Set(choice.filter((option) => known.has(option)))];
        if (valid.length > 0 && valid.length <= max) votes[viewer] = valid;
      }
      return { votes } as BlockStateByType[B['type']];
    }
    case 'quiz': {
      const { answers, submitted } = state as QuizState;
      const kept: Record<string, Record<string, string[]>> = {};
      for (const [viewer, mine] of Object.entries(answers)) {
        const valid: Record<string, string[]> = {};
        for (const question of block.questions) {
          if (!has(mine, question.id)) continue;
          const ids = new Set(question.choices.map((choice) => choice.id));
          const chosen = [...new Set((mine[question.id] as string[]).filter((c) => ids.has(c)))];
          if (chosen.length > 0 && (question.answers.length > 1 || chosen.length === 1)) {
            valid[question.id] = chosen;
          }
        }
        if (Object.keys(valid).length > 0) kept[viewer] = valid;
      }
      const done: Record<string, true> = {};
      for (const viewer of Object.keys(submitted)) if (has(kept, viewer)) done[viewer] = true;
      return { answers: kept, submitted: done } as BlockStateByType[B['type']];
    }
    case 'calculator': {
      const values: Record<string, number> = {};
      for (const input of block.inputs) {
        const value = has((state as CalculatorState).values, input.name)
          ? (state as CalculatorState).values[input.name]
          : undefined;
        if (typeof value === 'number' && value >= input.min && value <= input.max)
          values[input.name] = value;
      }
      return { values } as BlockStateByType[B['type']];
    }
    case 'counter': {
      const { value } = state as CounterState;
      const inRange =
        (block.min === undefined || value >= block.min) &&
        (block.max === undefined || value <= block.max);
      return (inRange ? { value } : initial) as BlockStateByType[B['type']];
    }
    case 'tabs': {
      const { panel } = state as TabsState;
      return (
        block.panels.some((p) => p.id === panel) ? { panel } : initial
      ) as BlockStateByType[B['type']];
    }
    case 'reveal':
      return state as BlockStateByType[B['type']];
    case 'chart-controls': {
      const { kind, hidden, range } = state as ChartControlsState;
      const series = block.spec.series.length;
      const keptHidden = block.seriesToggle
        ? [...new Set(hidden.filter((index) => index < series))].sort((a, b) => a - b)
        : [];
      const labels = block.spec.labels.length;
      return {
        kind: block.kinds?.includes(kind) ? kind : block.spec.kind,
        hidden: keptHidden.length >= series ? [] : keptHidden,
        range:
          block.range && range !== null && range[0] < range[1] && range[1] < labels ? range : null,
      } as BlockStateByType[B['type']];
    }
  }
}
