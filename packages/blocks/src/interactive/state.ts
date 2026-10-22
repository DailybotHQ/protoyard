import { z } from 'zod';
import type {
  CalculatorBlock,
  ChartControlsBlock,
  CounterBlock,
  PollBlock,
  QuizBlock,
  RevealBlock,
  TabsBlock,
} from '../schema/index.ts';

/**
 * Viewer state for interactive blocks. State is plain JSON, so the kind
 * runtime can store it in IndexedDB and snapshots can carry it; because both
 * are untrusted, every state and action has a zod schema. Maps are plain
 * objects read only through `Object.hasOwn`.
 */

/** Blocks whose state this module reduces. Map, embed-app and form keep state elsewhere. */
export type ReducibleBlock =
  | PollBlock
  | QuizBlock
  | CalculatorBlock
  | CounterBlock
  | TabsBlock
  | RevealBlock
  | ChartControlsBlock;

export type ReducibleBlockType = ReducibleBlock['type'];

export const REDUCIBLE_BLOCK_TYPES = Object.freeze([
  'poll',
  'quiz',
  'calculator',
  'counter',
  'tabs',
  'reveal',
  'chart-controls',
] as const satisfies readonly ReducibleBlockType[]);

/** Caps that keep persisted state small whatever a hostile snapshot says. */
export const BLOCK_STATE_LIMITS = Object.freeze({
  /** Distinct viewers (personas) recorded on one poll or quiz. */
  viewers: 500,
});

/** A viewer (persona) id, supplied by the host from the session, never by content. */
export const ViewerIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_][\w.:-]{0,63}$/, 'Use 1–64 letters, digits, _, ., : or -')
  .refine(
    (id) => id !== '__proto__' && id !== 'constructor' && id !== 'prototype',
    'Reserved name'
  );

const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const viewerMap = <T extends z.ZodType>(value: T) =>
  z
    .record(ViewerIdSchema, value)
    .refine((map) => Object.keys(map).length <= BLOCK_STATE_LIMITS.viewers, 'Too many viewers');

export const PollStateSchema = z.strictObject({
  /** Each viewer's chosen option ids. */
  votes: viewerMap(z.array(id).min(1).max(8)),
});

export const QuizStateSchema = z.strictObject({
  /** Each viewer's answers: question id → chosen choice ids. */
  answers: viewerMap(z.record(id, z.array(id).min(1).max(6))),
  /** Viewers who submitted (answers lock until a reset). */
  submitted: viewerMap(z.literal(true)),
});

export const CalculatorStateSchema = z.strictObject({
  /** Input values set by the viewer; missing inputs use their defaults. */
  values: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/), z.number().finite()),
});

export const CounterStateSchema = z.strictObject({ value: z.number().int() });

export const TabsStateSchema = z.strictObject({ panel: id });

export const RevealStateSchema = z.strictObject({ open: z.boolean() });

export const ChartControlsStateSchema = z.strictObject({
  kind: z.enum(['line', 'area', 'bar', 'donut', 'pie', 'funnel']),
  /** Indexes of hidden series. */
  hidden: z.array(z.number().int().min(0).max(7)).max(7),
  /** Inclusive label index range shown, or null for all labels. */
  range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable(),
});

export type PollState = z.infer<typeof PollStateSchema>;
export type QuizState = z.infer<typeof QuizStateSchema>;
export type CalculatorState = z.infer<typeof CalculatorStateSchema>;
export type CounterState = z.infer<typeof CounterStateSchema>;
export type TabsState = z.infer<typeof TabsStateSchema>;
export type RevealState = z.infer<typeof RevealStateSchema>;
export type ChartControlsState = z.infer<typeof ChartControlsStateSchema>;

/** The state type of each reducible block type. */
export interface BlockStateByType {
  poll: PollState;
  quiz: QuizState;
  calculator: CalculatorState;
  counter: CounterState;
  tabs: TabsState;
  reveal: RevealState;
  'chart-controls': ChartControlsState;
}

export type BlockState = BlockStateByType[ReducibleBlockType];

export const BLOCK_STATE_SCHEMAS = Object.freeze({
  poll: PollStateSchema,
  quiz: QuizStateSchema,
  calculator: CalculatorStateSchema,
  counter: CounterStateSchema,
  tabs: TabsStateSchema,
  reveal: RevealStateSchema,
  'chart-controls': ChartControlsStateSchema,
} satisfies { [K in ReducibleBlockType]: z.ZodType<BlockStateByType[K]> });

/** The state a block starts with, from its definition alone. */
export function initialBlockState<B extends ReducibleBlock>(block: B): BlockStateByType[B['type']] {
  const states: {
    [K in ReducibleBlockType]: (b: Extract<ReducibleBlock, { type: K }>) => BlockStateByType[K];
  } = {
    poll: () => ({ votes: {} }),
    quiz: () => ({ answers: {}, submitted: {} }),
    calculator: () => ({ values: {} }),
    counter: (b) => ({ value: b.start ?? 0 }),
    tabs: (b) => ({ panel: b.defaultPanel ?? (b.panels[0]?.id as string) }),
    reveal: (b) => ({ open: b.open ?? false }),
    'chart-controls': (b) => ({ kind: b.spec.kind, hidden: [], range: null }),
  };
  return (states[block.type] as unknown as (b: B) => BlockStateByType[B['type']])(block);
}

/** True when `block` has a reducer here. */
export function isReducibleBlock(block: { type: string }): block is ReducibleBlock {
  return (REDUCIBLE_BLOCK_TYPES as readonly string[]).includes(block.type);
}
