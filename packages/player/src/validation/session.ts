import {
  type Blueprint,
  entityTable,
  evaluateValidationSuccess,
  type ValidationObservation,
  type ValidationTask,
  validationBaseline,
} from '@protoyard/blueprint';
import type { PendingOperation, PendingTracker } from '@protoyard/core';
import { liveQuery } from 'dexie';

/**
 * One validation session over a blueprint's `validation.tasks` (ADR-031):
 * the participant starts a task, works in the prototype, and the session
 * detects success from the current route and the live data. It records the
 * outcome, the time taken and the steps: route changes plus completed service
 * calls. It never logs keys, text or anything a person types, and never uses
 * the network.
 */

export type AttemptOutcome = 'success' | 'gave-up' | 'timed-out';

export interface ValidationAttempt {
  taskId: string;
  outcome: AttemptOutcome;
  /** Wall-clock milliseconds from start to outcome. */
  durationMs: number;
  /** Route changes plus completed service calls while the task ran. */
  steps: number;
  startedAt: string;
  endedAt: string;
}

export type TaskPhase =
  | { phase: 'ready' }
  | { phase: 'running'; startedAt: number; steps: number }
  | { phase: 'done'; attempt: ValidationAttempt };

export interface SessionState {
  index: number;
  task: ValidationTask;
  total: number;
  current: TaskPhase;
  /** True after the last task has an outcome. */
  finished: boolean;
}

/** The route the participant is on (`/bookings/b-1`), and its changes. */
export interface RouteSource {
  current(): string;
  subscribe(listener: () => void): () => void;
}

/** The bits of the runtime a session reads: its database and pending tracker. */
export interface SessionRuntime {
  db: unknown;
  pending?: Pick<PendingTracker, 'subscribe'>;
}

export interface ValidationSessionOptions {
  blueprint: Blueprint;
  runtime: SessionRuntime;
  route: RouteSource;
  /** Called with each recorded attempt (the metrics store persists it). */
  record: (attempt: ValidationAttempt) => Promise<void>;
  /** Injectable clock and timers for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ValidationSession {
  state(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  start(): Promise<void>;
  giveUp(): Promise<void>;
  next(): void;
  close(): void;
}

type Rows = Record<string, Record<string, unknown>[]>;

interface TableLike {
  toArray(): Promise<Record<string, unknown>[]>;
}

/** Entities the tasks' data predicates read, mapped to their tables. */
function watchedTables(blueprint: Blueprint): Map<string, string> {
  const names = new Set(
    (blueprint.validation?.tasks ?? []).flatMap((task) =>
      task.success.data ? [task.success.data.entity] : []
    )
  );
  return new Map(
    blueprint.entities
      .filter((entity) => names.has(entity.name))
      .map((entity) => [entity.name, entityTable(entity)])
  );
}

/** Live rows of the watched entities; soft-deleted rows do not count. */
async function readRows(db: unknown, tables: Map<string, string>): Promise<Rows> {
  const out: Rows = {};
  for (const [entity, table] of tables) {
    const rows = await (db as { table(name: string): TableLike }).table(table).toArray();
    out[entity] = rows.filter((row) => row.deletedAt === undefined || row.deletedAt === null);
  }
  return out;
}

export function createValidationSession(options: ValidationSessionOptions): ValidationSession {
  const tasks = options.blueprint.validation?.tasks ?? [];
  if (tasks.length === 0) throw new Error('This blueprint has no validation tasks.');
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const tables = watchedTables(options.blueprint);
  const listeners = new Set<(state: SessionState) => void>();

  let index = 0;
  let current: TaskPhase = { phase: 'ready' };
  let rows: Rows = {};
  let baseline: Record<string, number> = {};
  let timer: unknown = null;
  let finishing: Promise<void> | null = null;
  const seenOperations = new Set<number>();

  const state = (): SessionState => ({
    index,
    task: tasks[index] as ValidationTask,
    total: tasks.length,
    current,
    finished: index === tasks.length - 1 && current.phase === 'done',
  });
  const emit = () => {
    const snapshot = state();
    for (const listener of [...listeners]) listener(snapshot);
  };

  const finish = (outcome: AttemptOutcome): Promise<void> => {
    if (current.phase !== 'running') return finishing ?? Promise.resolve();
    if (timer !== null) clearTimer(timer);
    timer = null;
    const ended = now();
    const attempt: ValidationAttempt = {
      taskId: (tasks[index] as ValidationTask).id,
      outcome,
      durationMs: Math.max(0, Math.round(ended - current.startedAt)),
      steps: current.steps,
      startedAt: new Date(current.startedAt).toISOString(),
      endedAt: new Date(ended).toISOString(),
    };
    current = { phase: 'done', attempt };
    emit();
    finishing = options.record(attempt).finally(() => {
      finishing = null;
    });
    return finishing;
  };

  const evaluate = () => {
    if (current.phase !== 'running') return;
    const observation: ValidationObservation = { route: options.route.current(), rows, baseline };
    if (evaluateValidationSuccess((tasks[index] as ValidationTask).success, observation).met) {
      void finish('success');
    }
  };

  const step = () => {
    if (current.phase !== 'running') return;
    current = { ...current, steps: current.steps + 1 };
    emit();
  };

  const stopRoute = options.route.subscribe(() => {
    step();
    evaluate();
  });
  const stopPending =
    options.runtime.pending?.subscribe((operations: readonly PendingOperation[]) => {
      for (const operation of operations) {
        if (operation.kind !== 'service' || seenOperations.has(operation.id)) continue;
        seenOperations.add(operation.id);
        step();
      }
    }) ?? (() => {});
  const subscription =
    tables.size > 0
      ? liveQuery(() => readRows(options.runtime.db, tables)).subscribe({
          next: (value) => {
            rows = value;
            evaluate();
          },
          error: (error) => console.error('[protoyard player] validation data', error),
        })
      : null;

  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    async start() {
      if (current.phase === 'running') return;
      rows = tables.size > 0 ? await readRows(options.runtime.db, tables) : {};
      baseline = validationBaseline(rows);
      current = { phase: 'running', startedAt: now(), steps: 0 };
      const limit = (tasks[index] as ValidationTask).timeLimitSeconds;
      if (limit !== undefined) timer = setTimer(() => void finish('timed-out'), limit * 1000);
      emit();
      evaluate();
    },
    giveUp: () => finish('gave-up'),
    next() {
      if (current.phase !== 'done' || index >= tasks.length - 1) return;
      index += 1;
      current = { phase: 'ready' };
      emit();
    },
    close() {
      if (timer !== null) clearTimer(timer);
      stopRoute();
      stopPending();
      subscription?.unsubscribe();
      listeners.clear();
    },
  };
}

/** The hash route (`#/bookings` → `/bookings`), with `hashchange` as its signal. */
export function hashRoute(
  win: Pick<Window, 'location' | 'addEventListener' | 'removeEventListener'>
): RouteSource {
  return {
    current: () => win.location.hash.replace(/^#/, '') || '/',
    subscribe(listener) {
      win.addEventListener('hashchange', listener);
      return () => win.removeEventListener('hashchange', listener);
    },
  };
}
