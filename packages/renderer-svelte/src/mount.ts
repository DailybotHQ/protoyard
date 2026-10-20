/// <reference path="./env.d.ts" />
import {
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseScenarioLink,
  type ScenarioLinkParams,
  type Theme,
} from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { BUILTIN_THEMES, mergeThemes } from '@protoyard/themes';
import { toast } from '@protoyard/ui';
import { type Component, mount, tick, unmount } from 'svelte';
import { bindAppearance } from './appearance.ts';
import { setMountedRuntime } from './context.ts';
import { BUILD_INFO, DEMO_BADGE_ENABLED, DEVTOOLS_ENABLED } from './flags.ts';
import BootError from './shell/BootError.svelte';
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
 * artifact target turns on `build.frameWhenEmbedded` (ADR-026), and
 * `publish --comments` points review at the same-origin comments Function.
 * Without build info (dev, tests) the definition is returned unchanged.
 */
export function applyBuildInfo(
  definition: PrototypeDefinition,
  build: {
    namespace?: string;
    frameWhenEmbedded?: boolean;
    review?: { adapter: 'local' | 'cloudflare' | 'http' | 'artifact'; endpoint?: string };
  } | null
): PrototypeDefinition {
  const manifest = definition.manifest;
  const namespace =
    build?.namespace && build.namespace !== manifest.storage.namespace
      ? build.namespace
      : undefined;
  const frameWhenEmbedded = build?.frameWhenEmbedded === true && !manifest.build.frameWhenEmbedded;
  const review = build?.review;
  if (!namespace && !frameWhenEmbedded && !review) return definition;
  return {
    ...definition,
    manifest: {
      ...manifest,
      ...(namespace ? { storage: { ...manifest.storage, namespace } } : {}),
      build: {
        ...manifest.build,
        ...(frameWhenEmbedded ? { frameWhenEmbedded: true } : {}),
        ...(review
          ? {
              review: {
                enabled: true,
                adapter: review.adapter,
                ...(review.endpoint ? { endpoint: review.endpoint } : {}),
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Boots a prototype: runtime → first-run seed → appearance → app → DevTools.
 * Any boot failure renders a recovery screen instead of a blank page.
 */
export async function mountPrototype(options: MountPrototypeOptions): Promise<MountedPrototype> {
  const { App, target } = options;
  const definition = applyBuildInfo(options.definition, BUILD_INFO);
  const link = parseScenarioLink(options.search ?? location.search);
  const themes = mergeThemes(BUILTIN_THEMES, definition.themes);
  const root = document.documentElement;
  delete root.dataset.protoyardReady;
  const cleanups: (() => void | Promise<void>)[] = [];

  const showBootError = (error: unknown): MountedPrototype => {
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
    root.dataset.pyReady = 'error';
    return {
      runtime: null,
      error,
      destroy: async () => {
        await unmount(screen);
      },
    };
  };

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
      props: { runtime: rt, App, demoBadge: options.demoBadge ?? DEMO_BADGE_ENABLED },
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
  if (devtoolsBuilt && (options.devtools ?? (DEVTOOLS_ENABLED && link.devtools !== false))) {
    try {
      // The avatar resolver rides along with the lazy DevTools chunk, so it
      // never reaches the initial JavaScript of a prototype without faces.
      const [{ mountDevtools }, { avatarImage }] = await Promise.all([
        import('@protoyard/devtools'),
        import('./avatars.ts'),
      ]);
      const panel = mountDevtools({ runtime: rt, themes, avatarImage });
      cleanups.push(() => panel.destroy());
    } catch (error) {
      console.error('[protoyard] DevTools failed to load', error);
    }
  }

  // Keep this define inline so a review-disabled production build folds away
  // the branch and has no review UI, adapter, or schema in its initial graph.
  const reviewBuilt =
    typeof __PROTOYARD_REVIEW__ !== 'undefined'
      ? __PROTOYARD_REVIEW__
      : options.definition.manifest.build.review?.enabled === true;
  const devtoolsAvailable =
    devtoolsBuilt && (options.devtools ?? (DEVTOOLS_ENABLED && link.devtools !== false));
  if (
    reviewBuilt ||
    (devtoolsAvailable &&
      new URLSearchParams(options.search ?? location.search).get('comments') === '1')
  ) {
    try {
      const { mountReview } = await import('@protoyard/review-ui/mount');
      const review = await mountReview({ definition, runtime: rt, root: target });
      cleanups.push(() => review.destroy());
    } catch (error) {
      console.error('[protoyard] review comments failed to load', error);
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
