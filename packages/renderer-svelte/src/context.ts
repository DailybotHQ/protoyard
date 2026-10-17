import type { PrototypeRuntime } from '@protoyard/core';
import { getContext, hasContext, setContext } from 'svelte';

const RUNTIME_KEY = Symbol.for('protoyard.runtime');

/**
 * Each prototype is its own document with exactly one runtime, so the mounted
 * runtime is also kept at module level. That lets plain `.ts` services and
 * code outside the component tree reach it, while components prefer context
 * (which keeps tests and nested mounts explicit).
 */
let mounted: PrototypeRuntime | null = null;

export function provideRuntime(runtime: PrototypeRuntime): void {
  setContext(RUNTIME_KEY, runtime);
}

export function setMountedRuntime(runtime: PrototypeRuntime | null): void {
  mounted = runtime;
}

/** The active runtime, typed with your prototype's database. */
export function getRuntime<TDatabase = unknown>(): PrototypeRuntime<TDatabase> {
  let fromContext: PrototypeRuntime | undefined;
  try {
    fromContext = hasContext(RUNTIME_KEY) ? getContext<PrototypeRuntime>(RUNTIME_KEY) : undefined;
  } catch {
    // Called outside component initialisation: fall back to the mounted runtime.
  }
  const runtime = fromContext ?? mounted;
  if (!runtime) {
    throw new Error(
      '[protoyard] No runtime available. Call getRuntime() inside a component rendered by mountPrototype(), or after it resolved.'
    );
  }
  return runtime as PrototypeRuntime<TDatabase>;
}
