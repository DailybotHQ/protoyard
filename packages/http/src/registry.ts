import type { PrototypeRuntime } from '@protoyard/core';
import type { MockApi } from './api.ts';

/**
 * Mock APIs per runtime, so DevTools can find them without the prototype
 * wiring anything: `createMockApi` registers itself. A WeakMap keeps a closed
 * runtime (and its APIs) collectable.
 */
const apis = new WeakMap<object, Set<MockApi>>();
const listeners = new WeakMap<object, Set<(apis: readonly MockApi[]) => void>>();

export function registerMockApi(runtime: PrototypeRuntime<unknown>, api: MockApi): () => void {
  const set = apis.get(runtime) ?? new Set();
  set.add(api);
  apis.set(runtime, set);
  notify(runtime);
  return () => {
    set.delete(api);
    notify(runtime);
  };
}

export function getMockApis(runtime: PrototypeRuntime<unknown>): readonly MockApi[] {
  return [...(apis.get(runtime) ?? [])];
}

export function subscribeMockApis(
  runtime: PrototypeRuntime<unknown>,
  listener: (apis: readonly MockApi[]) => void
): () => void {
  const set = listeners.get(runtime) ?? new Set();
  set.add(listener);
  listeners.set(runtime, set);
  return () => {
    set.delete(listener);
  };
}

function notify(runtime: PrototypeRuntime<unknown>) {
  const current = getMockApis(runtime);
  for (const listener of [...(listeners.get(runtime) ?? [])]) {
    try {
      listener(current);
    } catch {
      // DevTools must never break the app.
    }
  }
}
