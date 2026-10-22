import type { BlockHostOptions } from '@protoyard/blocks-ui';

/** The block-state contract blocks-ui renders from (`@protoyard/blocks/interactive`). */
type BlockStateHost = NonNullable<BlockHostOptions['stateHost']>;

/** The part of the kind services this host needs (`createKindServices(...).blockStates`). */
export interface StateHostSource {
  blockStates: BlockStateHost;
}

type Listener = (state: unknown) => void;

/**
 * A `BlockStateHost` usable at once while the persistent one (the kind
 * services, which read IndexedDB first) is still loading. Until it is ready,
 * `read` returns nothing (blocks show their initial state) and `dispatch`
 * waits; once ready, every subscriber is attached to the real host and told
 * its stored state, so blocks update from what was saved.
 */
export function createDeferredStateHost(source: Promise<StateHostSource>): BlockStateHost & {
  readonly ready: Promise<BlockStateHost>;
} {
  let real: BlockStateHost | null = null;
  /** Subscriptions made before the host was ready, and their real unsubscribe once attached. */
  const early = new Map<Listener, { key: string; off: (() => void) | null }>();

  const ready = source.then(({ blockStates }) => {
    real = blockStates;
    for (const [listener, entry] of early) {
      entry.off = blockStates.subscribe(entry.key, listener);
      const stored = blockStates.read(entry.key);
      if (stored === undefined) continue;
      try {
        listener(stored);
      } catch {
        // A subscriber's failure is its own.
      }
    }
    return blockStates;
  });

  return {
    ready,
    read: (key) => real?.read(key),
    async dispatch(key, block, action) {
      const host = real ?? (await ready);
      return host.dispatch(key, block, action);
    },
    subscribe(key, listener) {
      if (real) return real.subscribe(key, listener);
      const entry: { key: string; off: (() => void) | null } = { key, off: null };
      early.set(listener, entry);
      return () => {
        early.delete(listener);
        entry.off?.();
      };
    },
  };
}
