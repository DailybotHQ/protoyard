import type { Unsubscribe } from '@protoyard/core';

export interface Emitter<T> {
  emit(value: T): void;
  subscribe(listener: (value: T) => void): Unsubscribe;
  clear(): void;
}

/**
 * Tiny listener set. A throwing listener is reported but never stops the
 * others — one broken component must not freeze the whole prototype.
 */
export function createEmitter<T>(onError: (error: unknown) => void): Emitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value) {
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          onError(error);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear: () => listeners.clear(),
  };
}

/** Runs async jobs one at a time, in call order (load/advance/restore never interleave). */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function serial<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}
