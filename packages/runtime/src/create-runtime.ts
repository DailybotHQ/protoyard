import {
  type DataInspector,
  type PrototypeDefinition,
  type PrototypeRuntime,
  SANDBOX_PATTERN,
} from '@protoyard/core';
import {
  countTables,
  deleteProtoyardDatabases,
  openPrototypeStorage,
  type PrototypeDatabase,
  sandboxNamespace,
} from '@protoyard/database';
import { createIdentityController, type IdentityController } from './identity.ts';
import { createKernel, type Kernel } from './kernel.ts';
import { createMembersController } from './members.ts';
import type { RuntimeOptions } from './options.ts';
import { createEnvironmentFacade, createOverrideController } from './overrides.ts';
import { createScenarioController, type ScenarioControllerExtras } from './scenarios.ts';
import { createSessionController, createThemeController } from './session.ts';
import { createSnapshotController, type SnapshotControllerExtras } from './snapshots.ts';
import { createThemeExtras, type ThemeControllerExtras } from './theme.ts';

export const MAX_INSPECTOR_PAGE = 500;

/** The runtime returned by `createPrototypeRuntime`: the core contract plus a few extras. */
export interface ProtoyardRuntime extends PrototypeRuntime<PrototypeDatabase> {
  readonly scenarios: PrototypeRuntime['scenarios'] & ScenarioControllerExtras;
  readonly snapshots: PrototypeRuntime['snapshots'] & SnapshotControllerExtras;
  /** Runtime-created personas, organizations and memberships (sign-up, invites, workspaces). */
  readonly identity: IdentityController;
  /** Theme controller plus Theme Studio custom themes (saved in the control DB). */
  readonly theme: PrototypeRuntime['theme'] & ThemeControllerExtras;
  /** Present when running in a sandbox (`?sandbox=`). */
  readonly sandbox?: string;
  discardSandbox(): Promise<void>;
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
  // A valid `?sandbox=` gives this runtime its own pair of databases; anything
  // else (including an invalid name passed by hand) uses the default world.
  const sandbox =
    options.link?.sandbox && SANDBOX_PATTERN.test(options.link.sandbox)
      ? options.link.sandbox
      : undefined;
  const namespace = sandbox
    ? sandboxNamespace(definition.manifest.storage.namespace, sandbox)
    : definition.manifest.storage.namespace;
  const source = {
    manifest: { storage: { ...definition.manifest.storage, namespace } },
    database: definition.database,
  };
  const storage = await openPrototypeStorage(source, {
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
  const identity = createIdentityController(kernel);
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
    ...(sandbox ? { sandbox } : {}),
    manifest: definition.manifest,
    definition,
    db: kernel.db,
    scenarios,
    session: createSessionController(kernel),
    identity,
    members: createMembersController(kernel, identity),
    clock: kernel.clock,
    theme: { ...createThemeController(kernel), ...createThemeExtras(kernel) },
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
      await deleteProtoyardDatabases(namespace, kernel.backend);
    },
    async discardSandbox() {
      if (!sandbox) throw new Error('This runtime is not running in a sandbox.');
      await runtime.destroy();
    },
    close,
  };
  return runtime;
}
