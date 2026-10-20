/// <reference path="./env.d.ts" />
import {
  NamespaceSchema,
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseScenarioLink,
  type ScenarioLinkParams,
  type Theme,
} from '@protoyard/core';
import type { DevtoolsTab } from '@protoyard/devtools';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { BUILTIN_THEMES, mergeThemes } from '@protoyard/themes';
import { toast } from '@protoyard/ui';
import { type Component, mount, tick, unmount } from 'svelte';
import { bindAppearance } from './appearance.ts';
import { setMountedRuntime } from './context.ts';
import { BUILD_INFO, DEMO_BADGE_ENABLED, DEVTOOLS_ENABLED } from './flags.ts';
import BootError from './shell/BootError.svelte';
import { placeFloating } from './shell/floating.ts';
import Root from './shell/Root.svelte';

export interface RuntimeFactoryOptions {
  themes: Theme[];
  link: ScenarioLinkParams;
  /** Loads a theme id the prototype does not ship (the theme library, ADR-023). */
  resolveTheme: (id: string) => Promise<Theme | undefined>;
}

/**
 * Every prototype can use any theme of the `@protoyard/themes` library
 * (`?theme=fintech-ledger`, a scenario, a persona preference) with no code of
 * its own. The library's metadata and builder load on first use only: the
 * subpath is imported dynamically, never the themes barrel (already in every
 * initial chunk), so a page that never asks for a library theme downloads
 * none of it. Unknown ids resolve to `undefined` and fall back visibly.
 */
export async function resolveLibraryTheme(id: string): Promise<Theme | undefined> {
  const { getLibraryThemeMeta, loadLibraryTheme } = await import('@protoyard/themes/library');
  return getLibraryThemeMeta(id) ? loadLibraryTheme(id) : undefined;
}

/**
 * Build settings chosen at mount time instead of by Vite defines, for a
 * prebuilt app that runs many prototypes (the player, ADR-029). Each field
 * takes precedence over its define; omitted fields keep the build's value.
 *
 * `devtools` and `review` can only narrow what the bundle contains: a build
 * whose define is `false` has no DevTools or review chunk (the minifier drops
 * it), so `true` there has no effect. Build with them on and turn them off
 * per prototype.
 */
export interface MountBuildOptions {
  /** Storage namespace (IndexedDB names); must be a valid manifest namespace. */
  namespace?: string;
  /** Keep explicit device frames inside an iframe (ADR-026). */
  frameWhenEmbedded?: boolean;
  demoBadge?: boolean;
  /** Show the DevTools panel; `?devtools=0` still hides it when this is omitted. */
  devtools?: boolean;
  /** Mount review comments. */
  review?: boolean;
}

export interface MountPrototypeOptions {
  definition: PrototypeDefinition;
  // biome-ignore lint/suspicious/noExplicitAny: prototype apps may declare optional props.
  App: Component<any>;
  target: HTMLElement;
  /** Overrides `location.search` (tests, embedding). */
  search?: string;
  /** Injected for tests; defaults to `@protoyard/runtime`. */
  createRuntime?: (
    definition: PrototypeDefinition,
    options: RuntimeFactoryOptions
  ) => PrototypeRuntime | Promise<PrototypeRuntime>;
  /** Force DevTools on/off (defaults to the build flag + `?devtools=0`). */
  devtools?: boolean;
  demoBadge?: boolean;
  /** Runtime build settings; each one overrides its Vite define. */
  build?: MountBuildOptions;
}

export interface MountedPrototype {
  runtime: PrototypeRuntime | null;
  error: unknown;
  destroy(): Promise<void>;
}

declare global {
  interface Window {
    /** Debug/E2E handle: the running prototype runtime (simulation only). */
    __protoyard?: PrototypeRuntime;
    /** Set by the @protoyard/offline register script in offline-enabled builds. */
    __protoyardOffline?: { updateAvailable: boolean; applyUpdate(): void };
  }
}

/**
 * Applies what the build baked into `__PROTOYARD_BUILD__` to the definition:
 * template live demos (and any CLI override) set PROTOYARD_STORAGE_NAMESPACE
 * so IndexedDB never shares the template's authoring world, and the Claude
 * artifact target turns on `build.frameWhenEmbedded` (ADR-026). Without build
 * info (dev, tests) the definition is returned unchanged.
 */
export function applyBuildInfo(
  definition: PrototypeDefinition,
  build: { namespace?: string; frameWhenEmbedded?: boolean } | null
): PrototypeDefinition {
  const manifest = definition.manifest;
  const namespace =
    build?.namespace && build.namespace !== manifest.storage.namespace
      ? build.namespace
      : undefined;
  const frameWhenEmbedded = build?.frameWhenEmbedded === true && !manifest.build.frameWhenEmbedded;
  if (!namespace && !frameWhenEmbedded) return definition;
  return {
    ...definition,
    manifest: {
      ...manifest,
      ...(namespace ? { storage: { ...manifest.storage, namespace } } : {}),
      ...(frameWhenEmbedded ? { build: { ...manifest.build, frameWhenEmbedded: true } } : {}),
    },
  };
}

/**
 * Applies runtime build options over the definition (after the baked build
 * info): a `namespace` renames storage, and `frameWhenEmbedded` sets the flag
 * either way. An invalid namespace throws, before any storage is opened.
 */
export function applyBuildOptions(
  definition: PrototypeDefinition,
  build: Pick<MountBuildOptions, 'namespace' | 'frameWhenEmbedded'> | undefined
): PrototypeDefinition {
  const manifest = definition.manifest;
  const namespace =
    build?.namespace !== undefined && build.namespace !== manifest.storage.namespace
      ? NamespaceSchema.parse(build.namespace)
      : undefined;
  const frameWhenEmbedded =
    build?.frameWhenEmbedded !== undefined &&
    build.frameWhenEmbedded !== manifest.build.frameWhenEmbedded
      ? build.frameWhenEmbedded
      : undefined;
  if (namespace === undefined && frameWhenEmbedded === undefined) return definition;
  return {
    ...definition,
    manifest: {
      ...manifest,
      ...(namespace ? { storage: { ...manifest.storage, namespace } } : {}),
      ...(frameWhenEmbedded !== undefined
        ? { build: { ...manifest.build, frameWhenEmbedded } }
        : {}),
    },
  };
}

/**
 * Boots a prototype: runtime → first-run seed → appearance → app → DevTools.
 * Any boot failure renders a recovery screen instead of a blank page.
 */
export async function mountPrototype(options: MountPrototypeOptions): Promise<MountedPrototype> {
  const { App, target, build } = options;
  let definition: PrototypeDefinition;
  try {
    definition = applyBuildOptions(applyBuildInfo(options.definition, BUILD_INFO), build);
  } catch (error) {
    return showBootErrorFor(options.definition, target, error);
  }
  const link = parseScenarioLink(options.search ?? location.search);
  const themes = mergeThemes(BUILTIN_THEMES, definition.themes);
  const root = document.documentElement;
  delete root.dataset.protoyardReady;
  const cleanups: (() => void | Promise<void>)[] = [];

  const showBootError = (error: unknown) => showBootErrorFor(definition, target, error);

  let runtime: PrototypeRuntime | null = null;
  try {
    const create = options.createRuntime ?? createPrototypeRuntime;
    runtime = await create(definition, { themes, link, resolveTheme: resolveLibraryTheme });
    let seeded = false;
    const unsubscribeProgress = runtime.scenarios.subscribeProgress((progress) => {
      if (progress?.phase === 'generate') seeded = true;
    });
    try {
      await runtime.scenarios.ensureSeeded();
    } finally {
      unsubscribeProgress();
    }
    performance.mark('protoyard:world-ready', { detail: { seeded } });
  } catch (error) {
    runtime?.close();
    return showBootError(error);
  }

  const rt = runtime;
  setMountedRuntime(rt);
  window.__protoyard = rt;
  cleanups.push(bindAppearance(rt, themes, root));

  target.replaceChildren();
  let app: ReturnType<typeof mount>;
  try {
    // mount() runs the App's script synchronously: an App that throws while
    // initialising must get the recovery screen, not a blank page.
    app = mount(Root, {
      target,
      props: {
        runtime: rt,
        App,
        demoBadge: build?.demoBadge ?? options.demoBadge ?? DEMO_BADGE_ENABLED,
      },
    });
  } catch (error) {
    for (const cleanup of cleanups.reverse()) await cleanup();
    setMountedRuntime(null);
    if (window.__protoyard === rt) delete window.__protoyard;
    rt.close();
    return showBootError(error);
  }
  cleanups.push(() => unmount(app));

  await tick();
  root.dataset.protoyardReady = '1';
  performance.mark('protoyard:ready');

  // The define is read inline (not via flags.ts) so the minifier can fold it
  // and drop the DevTools chunk entirely from builds without DevTools.
  // Undeclared (tests, foreign bundlers) means "allowed when asked".
  const devtoolsBuilt =
    typeof __PROTOYARD_DEVTOOLS__ !== 'undefined' ? __PROTOYARD_DEVTOOLS__ : true;
  // Presentation mode (`?devtools=0`) hides the panel even in dev.
  const devtoolsAvailable =
    devtoolsBuilt &&
    (build?.devtools ?? options.devtools ?? (DEVTOOLS_ENABLED && link.devtools !== false));

  // Keep this define inline so a review-disabled production build folds away
  // the branch and has no review UI, adapter, or schema in its initial graph.
  // A runtime `build.review` can turn a built-in review off, never add one.
  const reviewBuilt =
    typeof __PROTOYARD_REVIEW__ !== 'undefined'
      ? __PROTOYARD_REVIEW__ && build?.review !== false
      : (build?.review ?? options.definition.manifest.build.review?.enabled === true);
  // Review mounts before DevTools, so DevTools can host its "Comments" tab.
  let reviewTab: { id: string; label: string; load: () => Promise<unknown> } | undefined;
  if (
    reviewBuilt ||
    (devtoolsAvailable &&
      new URLSearchParams(options.search ?? location.search).get('comments') === '1')
  ) {
    try {
      const { mountReview } = await import('@protoyard/review-ui/mount');
      const review = await mountReview({
        definition,
        runtime: rt,
        root: target,
        place: placeFloating,
        devtools: devtoolsAvailable,
        ...(typeof __PROTOYARD_REVIEW_ADAPTER__ !== 'undefined' && __PROTOYARD_REVIEW_ADAPTER__
          ? { adapter: __PROTOYARD_REVIEW_ADAPTER__ }
          : {}),
      });
      reviewTab = review.devtoolsTab;
      cleanups.push(() => review.destroy());
    } catch (error) {
      console.error('[protoyard] review comments failed to load', error);
    }
  }

  if (devtoolsAvailable) {
    try {
      // The avatar resolver rides along with the lazy DevTools chunk, so it
      // never reaches the initial JavaScript of a prototype without faces.
      const [{ mountDevtools }, { avatarImage }] = await Promise.all([
        import('@protoyard/devtools'),
        import('./avatars.ts'),
      ]);
      const panel = mountDevtools({
        runtime: rt,
        themes,
        avatarImage,
        ...(reviewTab ? { extraTabs: [reviewTab as DevtoolsTab] } : {}),
      });
      cleanups.push(() => panel.destroy());
    } catch (error) {
      console.error('[protoyard] DevTools failed to load', error);
    }
  }

  void requestPersistentStorage(rt);
  cleanups.push(watchOfflineUpdates());
  root.dataset.pyReady = 'true';
  return {
    runtime: rt,
    error: null,
    async destroy() {
      for (const cleanup of cleanups.reverse()) await cleanup();
      setMountedRuntime(null);
      if (window.__protoyard === rt) delete window.__protoyard;
      delete root.dataset.pyReady;
      delete root.dataset.protoyardReady;
      rt.close();
    },
  };
}

function showBootErrorFor(
  definition: PrototypeDefinition,
  target: HTMLElement,
  error: unknown
): MountedPrototype {
  console.error('[protoyard] boot failed', error);
  target.replaceChildren();
  const screen = mount(BootError, {
    target,
    props: {
      error,
      namespace: definition.manifest.storage.namespace,
      name: definition.manifest.name,
    },
  });
  document.documentElement.dataset.pyReady = 'error';
  return {
    runtime: null,
    error,
    destroy: async () => {
      await unmount(screen);
    },
  };
}

/**
 * Asks the browser once to keep this origin's IndexedDB from being evicted
 * under storage pressure. Best effort: browsers may silently decline, and the
 * in-memory fallback has nothing to persist. DevTools → Data shows the result.
 */
async function requestPersistentStorage(runtime: PrototypeRuntime): Promise<boolean | undefined> {
  if (runtime.storage().backend !== 'indexeddb') return undefined;
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist) return undefined;
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return undefined;
  }
}

/**
 * Offline-enabled builds never swap versions on their own: when a new
 * version is waiting, offer a reload (the user decides; edits live in
 * IndexedDB and survive it).
 */
function watchOfflineUpdates(): () => void {
  const show = () => {
    toast.info('Update available', {
      id: 'protoyard-offline-update',
      description: 'A newer version of this prototype is ready. Your data is kept.',
      duration: 0,
      action: { label: 'Reload', onClick: () => window.__protoyardOffline?.applyUpdate() },
    });
  };
  if (window.__protoyardOffline?.updateAvailable) show();
  window.addEventListener('protoyard:offline-update', show);
  return () => window.removeEventListener('protoyard:offline-update', show);
}
