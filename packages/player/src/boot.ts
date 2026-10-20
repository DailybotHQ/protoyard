import {
  type Blueprint,
  blueprintIdentity,
  definePrototypeFromBlueprint,
} from '@protoyard/blueprint';
import {
  type MountedPrototype,
  type MountPrototypeOptions,
  mountPrototype,
} from '@protoyard/renderer-svelte';
import PlayerApp from './PlayerApp.svelte';
import { setPlayerBlueprint } from './player-blueprint.ts';
import { markActiveExploration, recordExploration, resolvePlayerStorage } from './storage/index.ts';

export interface BootPlayerOptions {
  blueprint: Blueprint;
  target: HTMLElement;
  /** Overrides `location.search` (tests, embedding). */
  search?: string;
  /** Injected for tests; defaults to `@protoyard/runtime`. */
  createRuntime?: MountPrototypeOptions['createRuntime'];
  /** Injected IndexedDB for the player exploration index and storage tests. */
  indexFactory?: IDBFactory;
}

export interface BootedPlayer extends MountedPrototype {
  /** The content namespace this blueprint's IndexedDB data lives under (`bp-…`). */
  namespace: string;
}

/**
 * Runs a parsed blueprint as a prototype (ADR-029): content identity →
 * runtime definition → `mountPrototype` with runtime build options. Each
 * blueprint gets its own storage namespace, so two blueprints on one origin
 * never share data. DevTools are built in and stay on unless `?devtools=0`.
 */
export async function bootPlayer(options: BootPlayerOptions): Promise<BootedPlayer> {
  const { blueprint, target } = options;
  const identity = await blueprintIdentity(blueprint);
  const search = options.search ?? location.search;
  const storage = await resolvePlayerStorage(blueprint, identity, search);
  const { definition, appModel } = definePrototypeFromBlueprint(blueprint, {
    namespace: storage.namespace,
    slug: storage.namespace,
  });
  markActiveExploration(storage.namespace);
  try {
    await recordExploration(storage, options.indexFactory);
  } catch {
    // The index is convenience metadata; a blocked index must not hide the prototype world.
  }
  setPlayerBlueprint({ blueprint, model: appModel });
  const mounted = await mountPrototype({
    definition,
    App: PlayerApp,
    target,
    ...(options.search !== undefined ? { search: options.search } : {}),
    ...(options.createRuntime ? { createRuntime: options.createRuntime } : {}),
    // Honest labelling: every player prototype says its data is simulated.
    build: { namespace: storage.namespace, demoBadge: true },
  });
  // Validation tasks: a lazy panel, loaded only for blueprints that declare tasks.
  const tasks = blueprint.validation?.tasks.length ?? 0;
  if (tasks > 0 && mounted.runtime) {
    const runtime = mounted.runtime;
    const panel = import('./validation/index.ts').then(({ mountValidationPanel }) =>
      mountValidationPanel({ blueprint, namespace: storage.namespace, runtime })
    );
    panel.catch((error) => console.error('[protoyard player] validation panel', error));
    const destroy = mounted.destroy;
    mounted.destroy = async () => {
      await (await panel.catch(() => null))?.destroy();
      await destroy();
    };
  }
  return Object.assign(mounted, { namespace: storage.namespace });
}
