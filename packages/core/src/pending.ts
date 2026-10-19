/**
 * Pending operations: a tiny, framework-agnostic "is something processing?"
 * signal. The runtime feeds it from every `environment.run`, scenario load or
 * reset, time advance, snapshot restore and identity switch; renderers turn it
 * into a global progress bar and `aria-busy`, so a prototype gets loading
 * feedback without writing any code.
 */

/** What kind of work is in flight (lets a UI word its announcement). */
export type PendingKind = 'service' | 'scenario' | 'time' | 'snapshot' | 'session' | 'other';

export interface PendingOperation {
  /** Unique per tracker, increasing. */
  readonly id: number;
  readonly kind: PendingKind;
  /** Short human label ("Switching persona…") or the service operation name (`deals.update`). */
  readonly label: string;
}

export interface PendingInput {
  kind?: PendingKind;
  label: string;
}

export interface PendingTracker {
  /** Operations in flight right now, oldest first. */
  list(): readonly PendingOperation[];
  /** Number of operations in flight. */
  count(): number;
  /**
   * Counts `work` as pending from this call (synchronously) until it settles.
   * The result and any error pass through unchanged.
   */
  track<T>(input: PendingInput, work: () => T | Promise<T>): Promise<T>;
  /** Marks an operation as started; call the returned function once when it ends. */
  begin(input: PendingInput): () => void;
  /** Fires with the current list whenever an operation starts or ends. */
  subscribe(listener: (operations: readonly PendingOperation[]) => void): () => void;
}

export function createPendingTracker(
  options: { onError?: (error: unknown) => void } = {}
): PendingTracker {
  const report =
    options.onError ??
    ((error: unknown) => {
      console.error('[protoyard/pending]', error);
    });
  let operations: readonly PendingOperation[] = [];
  let nextId = 1;
  const listeners = new Set<(operations: readonly PendingOperation[]) => void>();

  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener(operations);
      } catch (error) {
        report(error);
      }
    }
  };

  const begin = (input: PendingInput): (() => void) => {
    const operation: PendingOperation = {
      id: nextId++,
      kind: input.kind ?? 'other',
      label: input.label,
    };
    operations = [...operations, operation];
    emit();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      operations = operations.filter((op) => op.id !== operation.id);
      emit();
    };
  };

  const tracker: PendingTracker = {
    list: () => operations,
    count: () => operations.length,
    begin,
    async track(input, work) {
      const end = begin(input);
      try {
        return await work();
      } finally {
        end();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return tracker;
}
