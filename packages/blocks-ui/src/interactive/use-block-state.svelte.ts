import {
  type BlockStateByType,
  type BlockStateHost,
  createMemoryBlockStateHost,
  type ReducibleBlock,
  readBlockState,
  stateKey,
} from '@protoyard/blocks/interactive';
import { getBlockHost } from '../host.ts';

/** Shared preview host when the parent did not pass `stateHost`. */
let fallbackHost: BlockStateHost | undefined;

function memoryFallback(): BlockStateHost {
  fallbackHost ??= createMemoryBlockStateHost();
  return fallbackHost;
}

/**
 * Reactive block state bound to the nearest `BlockStateHost`. Every change
 * goes through `host.dispatch` (returns a promise for Button pending). Never
 * writes storage directly.
 */
export function useBlockState<B extends ReducibleBlock>(block: () => B) {
  const hostCtx = getBlockHost();
  const documentId = hostCtx.documentId ?? 'preview';
  const stateHost = hostCtx.stateHost;

  let state = $state.raw(
    readBlockState(stateHost ?? memoryFallback(), stateKey(documentId, block().id), block())
  );
  let error = $state<string | null>(null);
  let pending = $state(false);

  const key = $derived(stateKey(documentId, block().id));
  const host = $derived(stateHost ?? memoryFallback());

  $effect(() => {
    const currentKey = key;
    const currentHost = host;
    const currentBlock = block();
    state = readBlockState(currentHost, currentKey, currentBlock);
    return currentHost.subscribe(currentKey, () => {
      state = readBlockState(currentHost, currentKey, currentBlock);
    });
  });

  async function dispatch(action: unknown): Promise<BlockStateByType[B['type']] | null> {
    error = null;
    pending = true;
    try {
      const next = await host.dispatch(key, block(), action);
      state = next as BlockStateByType[B['type']];
      return next as BlockStateByType[B['type']];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not update this block.';
      return null;
    } finally {
      pending = false;
    }
  }

  return {
    get state() {
      return state as BlockStateByType[B['type']];
    },
    get error() {
      return error;
    },
    get pending() {
      return pending;
    },
    get viewerId() {
      return hostCtx.viewerId ?? 'viewer';
    },
    get hasHost() {
      return stateHost !== undefined;
    },
    dispatch,
  };
}
