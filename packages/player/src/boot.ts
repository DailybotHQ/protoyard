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

export interface BootPlayerOptions {
  blueprint: Blueprint;
  target: HTMLElement;
  /** Overrides `location.search` (tests, embedding). */
  search?: string;
  /** Injected for tests; defaults to `@protoyard/runtime`. */
  createRuntime?: MountPrototypeOptions['createRuntime'];
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
  const { namespace } = await blueprintIdentity(blueprint);
  const { definition, appModel } = definePrototypeFromBlueprint(blueprint, {
    namespace,
    slug: namespace,
  });
  setPlayerBlueprint({ blueprint, model: appModel });
  const mounted = await mountPrototype({
    definition,
    App: PlayerApp,
    target,
    ...(options.search !== undefined ? { search: options.search } : {}),
    ...(options.createRuntime ? { createRuntime: options.createRuntime } : {}),
    // Honest labelling: every player prototype says its data is simulated.
    build: { namespace, demoBadge: true },
  });
  return Object.assign(mounted, { namespace });
}
