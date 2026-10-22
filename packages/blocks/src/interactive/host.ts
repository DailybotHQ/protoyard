import { reduceBlockState, restoreBlockState } from './reducers.ts';
import { type BlockStateByType, initialBlockState, type ReducibleBlock } from './state.ts';

/**
 * The seam between interactive blocks and storage. blocks-ui renders from
 * `read` and changes state only through `dispatch`, which returns a promise so
 * buttons can show pending feedback. The kind runtime implements the host as
 * a service (`session.assert` → zod → `environment.run` →
 * `db.transaction`); `createMemoryBlockStateHost` is the in-memory version for
 * previews and tests. blocks-ui never touches a database.
 */
export interface BlockStateHost {
  /** The stored state for `key`, or `undefined` before the first change. Untrusted: restore it. */
  read(key: string): unknown;
  /**
   * Applies `action` to the block's state and resolves with the new state, or
   * rejects with a `BlockActionError` when the block refuses the action.
   */
  dispatch<B extends ReducibleBlock>(
    key: string,
    block: B,
    action: unknown
  ): Promise<BlockStateByType[B['type']]>;
  /** Calls `listener` after every change to `key`; returns the unsubscribe function. */
  subscribe(key: string, listener: (state: unknown) => void): () => void;
}

/** A refused action: the state did not change. */
export class BlockActionError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = 'BlockActionError';
    this.key = key;
  }
}

const DOCUMENT_ID = /^[A-Za-z0-9][\w.-]{0,127}$/;
const BLOCK_ID = /^[a-z][a-z0-9-]{0,47}$/;

/** The storage key of a block's state: `<documentId>/<blockId>`. Throws on malformed ids. */
export function stateKey(documentId: string, blockId: string): string {
  if (!DOCUMENT_ID.test(documentId))
    throw new RangeError(`Invalid document id: ${JSON.stringify(documentId)}`);
  if (!BLOCK_ID.test(blockId)) throw new RangeError(`Invalid block id: ${JSON.stringify(blockId)}`);
  return `${documentId}/${blockId}`;
}

/** The parts of a state key, or `null` when it is malformed. */
export function parseStateKey(key: string): { documentId: string; blockId: string } | null {
  const slash = key.lastIndexOf('/');
  if (slash < 0) return null;
  const documentId = key.slice(0, slash);
  const blockId = key.slice(slash + 1);
  return DOCUMENT_ID.test(documentId) && BLOCK_ID.test(blockId) ? { documentId, blockId } : null;
}

/** The block's current state from a host: restored and valid, or the initial state. */
export function readBlockState<B extends ReducibleBlock>(
  host: BlockStateHost,
  key: string,
  block: B
): BlockStateByType[B['type']] {
  const raw = host.read(key);
  return raw === undefined ? initialBlockState(block) : restoreBlockState(block, raw);
}

export interface MemoryBlockStateHostOptions {
  /** Starting states by key (validated on read, like any stored state). */
  initial?: Readonly<Record<string, unknown>>;
}

/**
 * An in-memory host: the same reducers, no persistence. Listener errors are
 * isolated, so one broken subscriber never blocks another or the dispatch.
 */
export function createMemoryBlockStateHost(
  options: MemoryBlockStateHostOptions = {}
): BlockStateHost & {
  /** Every stored state, for tests and snapshots. */
  entries(): [string, unknown][];
} {
  const states = new Map<string, unknown>(Object.entries(options.initial ?? {}));
  const listeners = new Map<string, Set<(state: unknown) => void>>();
  const host: BlockStateHost = {
    read: (key) => states.get(key),
    dispatch(key, block, action) {
      const result = reduceBlockState(block, readBlockState(host, key, block), action);
      if (!result.ok) return Promise.reject(new BlockActionError(key, result.error));
      states.set(key, result.state);
      for (const listener of [...(listeners.get(key) ?? [])]) {
        try {
          listener(result.state);
        } catch {
          // A subscriber's failure is its own; the state change stands.
        }
      }
      return Promise.resolve(result.state);
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  };
  return { ...host, entries: () => [...states.entries()] };
}
