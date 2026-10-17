import type { DataInspector, PrototypeDefinition, PrototypeRuntime } from '@protoyard/core';
import {
  countTables,
  deleteProtoyardDatabases,
  openPrototypeStorage,
  type PrototypeDatabase,
} from '@protoyard/database';
import { createKernel, type Kernel } from './kernel.ts';
import type { RuntimeOptions } from './options.ts';
import { createEnvironmentFacade, createOverrideController } from './overrides.ts';
import { createScenarioController, type ScenarioControllerExtras } from './scenarios.ts';
import { createSessionController, createThemeController } from './session.ts';
import { createSnapshotController, type SnapshotControllerExtras } from './snapshots.ts';

export const MAX_INSPECTOR_PAGE = 500;

/** The runtime returned by `createPrototypeRuntime`: the core contract plus a few extras. */
export interface ProtoyardRuntime extends PrototypeRuntime<PrototypeDatabase> {
  readonly scenarios: PrototypeRuntime['scenarios'] & ScenarioControllerExtras;
  readonly snapshots: PrototypeRuntime['snapshots'] & SnapshotControllerExtras;
  /** True after `close()` or `destroy()`. */
  readonly closed: boolean;
}

function createInspector(k: Kernel): DataInspector {
  return {
    tables: () => k.db.allTables,
    counts: () => countTables(k.db),
    async rows(table, options = {}) {
      const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 50)), MAX_INSPECTOR_PAGE);
      const offset = Math.max(0, Math.floor(options.offset ?? 0));
      return k.db.rows(table).offset(offset).limit(limit).toArray();
    },
  };
}

/**
 * Opens this prototype's storage and composes every controller. It does NOT
 * seed: call `runtime.scenarios.ensureSeeded()` once the UI can show progress
 * (it is a no-op when a world already exists, so reopening never resets edits).
 */
export async function createPrototypeRuntime(
  definition: PrototypeDefinition,
  options: RuntimeOptions = {}
): Promise<ProtoyardRuntime> {
  const storage = await openPrototypeStorage(definition, {
    ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
    ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
    ...(options.allowMemoryFallback !== undefined
      ? { allowMemoryFallback: options.allowMemoryFallback }
      : {}),
  });

  let kernel: Kernel;
  try {
    kernel = await createKernel(definition, storage, options);
  } catch (error) {
    storage.db.close();
    storage.control.close();
    throw error;
  }

  const snapshots = createSnapshotController(kernel);
  const scenarios = createScenarioController(kernel, (name) =>
    snapshots.save({ name, notes: 'Saved automatically before replacing the world.' })
  );
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    kernel.dispose();
    kernel.db.close();
    kernel.control.close();
  };

  const runtime: ProtoyardRuntime = {
    prototypeId: definition.manifest.id,
    manifest: definition.manifest,
    definition,
    db: kernel.db,
    scenarios,
    session: createSessionController(kernel),
    clock: kernel.clock,
    theme: createThemeController(kernel),
    environment: createEnvironmentFacade(kernel),
    snapshots,
    overrides: createOverrideController(kernel),
    policy: kernel.policy,
    data: createInspector(kernel),
    storage: () => ({ ...kernel.status }),
    environmentState: () => kernel.env.get(),
    get closed() {
      return closed;
    },
    async destroy() {
      // Wait for in-flight loads/advances so nothing writes after deletion.
      await kernel.serial(async () => undefined);
      close();
      await deleteProtoyardDatabases(definition.manifest.storage.namespace, kernel.backend);
    },
    close,
  };
  return runtime;
}
