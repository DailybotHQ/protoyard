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
import { createPlayerWorldCache, type WorldCache, withWorldCache } from './cache/index.ts';
import PlayerApp from './PlayerApp.svelte';
import { setPlayerBlueprint } from './player-blueprint.ts';
import { markActiveExploration, recordExploration, resolvePlayerStorage } from './storage/index.ts';
import { withWorkerGeneration } from './worker/generate-world.ts';

/**
 * The comments API `protoyard quick serve` hosts on its own origin
 * (`/api/comments/<namespace>`). Fixed here, never taken from a URL or a
 * response, so nothing can point the player's comments at another server.
 */
export const QUICK_REVIEW_ENDPOINT = '/api/comments';

export interface BootPlayerOptions {
  blueprint: Blueprint;
  target: HTMLElement;
  /** Overrides `location.search` (tests, embedding). */
  search?: string;
  /** Injected for tests; defaults to `@protoyard/runtime`. */
  createRuntime?: MountPrototypeOptions['createRuntime'];
  /** Injected IndexedDB for the player exploration index and storage tests. */
  indexFactory?: IDBFactory;
  /** Generated-world cache; defaults to the origin's IndexedDB cache (memory when blocked). */
  worldCache?: WorldCache;
  /**
   * Opens the blueprint in this storage namespace instead of its own (live
   * reload re-derives a changed blueprint in the world it already has).
   */
  namespace?: string;
  /**
   * Keeps this prototype generator version (with `namespace`): the reopened
   * world was built by it, so the runtime must not treat it as stale and
   * rebuild it. Live reload only.
   */
  generatorVersion?: number;
  /**
   * Review comments through `quick serve`'s same-origin comments API: mounts
   * the review UI with the `http` adapter on {@link QUICK_REVIEW_ENDPOINT}.
   */
  review?: boolean;
}

/** `search` with `name=value` set (kept when already present). */
function withParam(search: string, name: string, value: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(name)) params.set(name, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export interface BootedPlayer extends MountedPrototype {
  /** The content namespace this blueprint's IndexedDB data lives under (`bp-…`). */
  namespace: string;
  /** The prototype generator version its world is (or was) built with. */
  generatorVersion: number | undefined;
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
  const resolved = await resolvePlayerStorage(blueprint, identity, search);
  const storage = options.namespace ? { ...resolved, namespace: options.namespace } : resolved;
  const { definition: blueprintDefinition, appModel } = definePrototypeFromBlueprint(blueprint, {
    namespace: storage.namespace,
    slug: storage.namespace,
  });
  const generated = withWorkerGeneration(blueprintDefinition, blueprint);
  // The SaaS kit adds its own stores, rows and capabilities (loaded only for that archetype).
  const withKit =
    blueprint.archetype?.id === 'saas-onboarding'
      ? (await import('./archetypes/business/saas.ts')).withSaasKit(generated, blueprint)
      : generated;
  // A cache hit reopens a scenario without regenerating; a miss generates in the worker.
  const cached = withWorldCache(withKit, {
    blueprintSha256: identity.sha256,
    cache: options.worldCache ?? createPlayerWorldCache(options.indexFactory),
  });
  // Served by `quick serve`: comments go to its same-origin API at a fixed path,
  // never one from the URL (the renderer loads the review UI lazily when
  // `comments=1` and DevTools are on).
  const pinned =
    options.generatorVersion !== undefined
      ? { ...cached, generatorVersion: options.generatorVersion }
      : cached;
  const definition = options.review
    ? {
        ...pinned,
        manifest: {
          ...pinned.manifest,
          build: {
            ...pinned.manifest.build,
            review: { enabled: true, adapter: 'http' as const, endpoint: QUICK_REVIEW_ENDPOINT },
          },
        },
      }
    : pinned;
  const mountSearch = options.review ? withParam(search, 'comments', '1') : options.search;
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
    ...(mountSearch !== undefined ? { search: mountSearch } : {}),
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
  return Object.assign(mounted, {
    namespace: storage.namespace,
    generatorVersion: definition.generatorVersion,
  });
}
