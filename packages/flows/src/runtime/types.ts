/**
 * Mock flow runtime types. Everything a run produces stays in-memory as
 * proposed effects, keeps, signals and a masked outbox — never a network call.
 */

export type FlowRunStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

export type OutboxKind =
  | 'dm'
  | 'channel'
  | 'thread'
  | 'email'
  | 'inbox'
  | 'notification'
  | 'reply'
  | 'tool'
  | 'http';

export type SignalKind = 'blocker' | 'waiting' | 'approval' | 'failed';

export interface FlowPerson {
  id: string;
  name: string;
  role?: string;
  team?: string;
}

export interface FlowKeepRecord {
  id: string;
  collection: string;
  title: string;
  state: string | null;
  fields: Record<string, string>;
  runId: string;
  createdAt: string;
  history: { to: string; at: string; by: string | null }[];
}

export interface FlowListState {
  items: string[];
  used: string[];
  history: string[][];
}

export interface OutboxItem {
  id: string;
  at: string;
  kind: OutboxKind;
  text: string;
  flowId: string;
  runId: string;
  stepId: string;
  to?: string[];
  channel?: string;
  subject?: string;
  /** Masked when kind is http. */
  url?: string;
  method?: string;
  tool?: string;
  action?: string;
}

export interface ProposedEffect {
  type: string;
  stepId: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface Signal {
  id: string;
  kind: SignalKind;
  at: string;
  resolved: boolean;
  flowId: string;
  runId: string;
  stepId?: string;
  title: string;
  detail: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: FlowRunStatus;
  startedAt: string;
  finishedAt: string | null;
  trigger: Readonly<Record<string, unknown>>;
  error: string | null;
  /** Step ids visited in order (including skipped branches' chosen arm). */
  path: string[];
}

export interface FlowRunResult {
  run: FlowRun;
  /** Step outputs keyed by step id. */
  outputs: Readonly<Record<string, unknown>>;
  /** Proposed side effects for a service adapter (messages, tools, records…). */
  effects: readonly ProposedEffect[];
  /** Masked delivery log — nothing left the browser. */
  outbox: readonly OutboxItem[];
  /** Records and list mutations the run kept. */
  keeps: {
    records: readonly FlowKeepRecord[];
    lists: Readonly<Record<string, FlowListState>>;
  };
  signals: readonly Signal[];
  /** Simulated clock after the run (ISO). */
  now: string;
}

export interface FlowRuntimeOptions {
  /** Simulated instant (ISO string, Date, or epoch ms). Default: fixed epoch. */
  now?: string | number | Date;
  /** Deterministic seed for picks, groups and assistant labels. */
  seed?: number | string;
  /** Payload that started the run (manual form, event, webhook sample). */
  trigger?: Readonly<Record<string, unknown>>;
  /** Record the run is about (event triggers). */
  record?: unknown;
  /** Directory for audience resolution (fictional people only). */
  people?: readonly FlowPerson[];
  /** Existing keeps the run may read. */
  records?: Readonly<Record<string, readonly FlowKeepRecord[]>>;
  lists?: Readonly<Record<string, FlowListState>>;
  /**
   * Answers for `ask` steps: step id → field map, or a single value applied to
   * the first question.
   */
  answers?: Readonly<Record<string, unknown>>;
  /** Decisions for `approval` steps: step id → approved | declined. */
  decisions?: Readonly<Record<string, 'approved' | 'declined'>>;
  /** Tool handlers by tool id. Must be pure and local — never fetch. */
  tools?: Readonly<Record<string, (input: Readonly<Record<string, unknown>>) => unknown>>;
  /** Optional judge for `judge` conditions (`undecided` leaves the run waiting). */
  judge?: (request: { phrase: string; judge: string }) => boolean | 'undecided';
  /**
   * When true (default), `ask` / `approval` without answers leave the run
   * `waiting`. When false, missing answers fail the run.
   */
  waitForPeople?: boolean;
}
