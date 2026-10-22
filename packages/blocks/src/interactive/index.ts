/**
 * `@protoyard/blocks/interactive` — viewer state for interactive blocks
 * (ADR-037): a zod state and action schema plus a pure reducer per block
 * (poll, quiz, calculator, counter, tabs, reveal, chart controls), derived
 * views (poll results, quiz score and seeded choice order, calculator outputs
 * and chart, the chart spec to draw), and the `BlockStateHost` contract the
 * kind runtime implements as a service. Reducers never mutate, never throw,
 * never read the clock or a random source, and refuse actions that do not
 * fit the block.
 *
 * ```ts
 * const host = createMemoryBlockStateHost();
 * const key = stateKey('launch-deck', 'favorite');
 * await host.dispatch(key, pollBlock, { type: 'vote', viewer: 'ada', options: ['decks'] });
 * pollResults(pollBlock, readBlockState(host, key, pollBlock), 'ada');
 * ```
 */
export {
  BlockActionError,
  type BlockStateHost,
  createMemoryBlockStateHost,
  type MemoryBlockStateHostOptions,
  parseStateKey,
  readBlockState,
  stateKey,
} from './host.ts';
export {
  BLOCK_ACTION_SCHEMAS,
  type BlockAction,
  type BlockActionByType,
  type CalculatorAction,
  CalculatorActionSchema,
  type ChartControlsAction,
  ChartControlsActionSchema,
  type CounterAction,
  CounterActionSchema,
  calculatorChart,
  calculatorOutputs,
  calculatorValues,
  chartControlsSpec,
  type PollAction,
  PollActionSchema,
  type PollResults,
  pollResults,
  type QuizAction,
  QuizActionSchema,
  type QuizScore,
  quizChoiceOrder,
  quizScore,
  type ReduceResult,
  type RevealAction,
  RevealActionSchema,
  reduceBlockState,
  restoreBlockState,
  type TabsAction,
  TabsActionSchema,
} from './reducers.ts';
export {
  BLOCK_STATE_LIMITS,
  BLOCK_STATE_SCHEMAS,
  type BlockState,
  type BlockStateByType,
  type CalculatorState,
  CalculatorStateSchema,
  type ChartControlsState,
  ChartControlsStateSchema,
  type CounterState,
  CounterStateSchema,
  initialBlockState,
  isReducibleBlock,
  type PollState,
  PollStateSchema,
  type QuizState,
  QuizStateSchema,
  REDUCIBLE_BLOCK_TYPES,
  type ReducibleBlock,
  type ReducibleBlockType,
  type RevealState,
  RevealStateSchema,
  type TabsState,
  TabsStateSchema,
  ViewerIdSchema,
} from './state.ts';
