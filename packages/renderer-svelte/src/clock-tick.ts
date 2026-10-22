import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from './context.ts';

export type ClockTickHandler = (now: Date) => unknown;

export interface ClockTickOptions {
  /** Runtime to observe; defaults to the runtime mounted by the renderer. */
  runtime?: PrototypeRuntime;
  /** Handle a failed tick without stopping later clock notifications. */
  onError?: (error: unknown, now: Date) => void;
}

/**
 * Run `handler` once after registration and after each effective clock change.
 * Synchronous changes coalesce into one tick, and async handlers never overlap.
 * The returned function unsubscribes and drops any queued tick.
 */
export function onClockTick(handler: ClockTickHandler, options: ClockTickOptions = {}): () => void {
  const runtime = options.runtime ?? getRuntime();
  let queued = false;
  let running = false;
  let dirty = false;
  let stopped = false;
  let lastCompletedAt: number | undefined;

  const schedule = () => {
    dirty = true;
    if (queued || running || stopped) return;
    queued = true;
    queueMicrotask(() => void flush());
  };

  const flush = async () => {
    queued = false;
    if (stopped || running || !dirty) return;
    dirty = false;
    running = true;
    const now = runtime.clock.now();
    const at = now.getTime();
    try {
      if (lastCompletedAt !== at) {
        await handler(now);
        lastCompletedAt = at;
      }
    } catch (error) {
      try {
        options.onError?.(error, now);
      } catch (reportingError) {
        console.error('[protoyard/renderer] Clock tick error handler failed', reportingError);
      }
      if (!options.onError) console.error('[protoyard/renderer] Clock tick failed', error);
    } finally {
      running = false;
      if (dirty) schedule();
    }
  };

  const unsubscribe = runtime.clock.subscribe(schedule);
  schedule();
  return () => {
    stopped = true;
    dirty = false;
    unsubscribe();
  };
}
