import type { PrototypeDefinition, PrototypeRuntime } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

/**
 * Boots a real runtime on an isolated in-memory IndexedDB. `reload()` closes
 * it and reopens against the same storage, like a browser page reload.
 */
export function createHarness<TDb>(definition: PrototypeDefinition) {
  const indexedDB = new IDBFactory();
  const open: PrototypeRuntime[] = [];
  const boot = async (scenario?: string): Promise<PrototypeRuntime<TDb>> => {
    const runtime = (await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
      ...(scenario ? { link: { scenario } } : {}),
    })) as unknown as PrototypeRuntime<TDb>;
    await runtime.scenarios.ensureSeeded();
    open.push(runtime as PrototypeRuntime);
    return runtime;
  };
  return {
    boot,
    async reload(runtime: PrototypeRuntime<TDb>) {
      runtime.close();
      return boot();
    },
    closeAll() {
      for (const runtime of open.splice(0)) runtime.close();
    },
  };
}
