import type { Rng, SimulationClock, SimulationEnvironment } from '@protoyard/core';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  model?: string;
  usage?: AiUsage;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface AiModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  simulated: true;
}

export interface AiClock extends Pick<SimulationClock, 'now' | 'nowMs'> {
  sleep(ms: number): Promise<void>;
}

export interface AiContext {
  seed: number | string;
  rng: Rng;
  clock: AiClock;
  environment: Pick<SimulationEnvironment, 'run' | 'get'>;
}

export interface ResponseInput {
  prompt: string;
  history: readonly AiMessage[];
  model: AiModel;
  rng: Rng;
}

export interface ResponsePack {
  id: string;
  name: string;
  generate(input: ResponseInput): string;
}

export interface StreamOptions {
  model?: string;
  maxTokens?: number;
  cadenceMs?: number;
}

export interface AiChunk {
  streamId: string;
  token: string;
  index: number;
}

export interface AiStream extends AsyncIterable<AiChunk> {
  readonly id: string;
  stop(): void;
}

export interface AiBranch {
  id: string;
  parentId?: string;
  messages: AiMessage[];
}

export interface AiEngineOptions {
  context: AiContext;
  packs?: readonly ResponsePack[];
  models?: readonly AiModel[];
  maxRequestsPerMinute?: number;
  defaultCadenceMs?: number;
}

/** Chart kinds a response may ask for; each maps to a `@protoyard/charts-ui` component. */
export type AiChartKind = 'line' | 'area' | 'bar' | 'donut' | 'pie' | 'funnel';

/** How chart values are formatted: `cents` are integer cents, `percent` values are ratios. */
export type AiChartUnit = 'number' | 'compact' | 'cents' | 'percent';

/**
 * A chart in a simulated answer, written as JSON in a ```` ```chart ```` fence.
 * It is plain data checked by `ChartSpecSchema` (`@protoyard/ai/chart`); it is
 * never evaluated and its strings render only as text.
 */
export interface AiChartSpec {
  kind: AiChartKind;
  title: string;
  description?: string;
  unit?: AiChartUnit;
  /** ISO 4217 code for `cents` (default USD). */
  currency?: string;
  /** x categories (cartesian) or slice / step names (donut, pie, funnel). */
  labels: string[];
  /** One value per label; donut, pie and funnel take exactly one series. */
  series: { label: string; values: (number | null)[] }[];
}
