import type { AppModel, AppRoute, Blueprint, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import type { HashRouter } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('protoyard-blueprint-app');

/** Theme choices the settings screen offers beyond the prototype's own themes. */
export type ThemeLibraryLoader = () => Promise<readonly { id: string; name: string }[]>;

/** What every screen of a blueprint app reads: the runtime, services, blueprint and app model. */
export interface BlueprintAppContext {
  readonly runtime: PrototypeRuntime;
  readonly services: EntityServices;
  readonly blueprint: Blueprint;
  readonly model: AppModel;
  readonly router: HashRouter;
  /** The app-model route a router path belongs to. */
  routeFor(path: string | undefined): AppRoute | undefined;
  readonly themeLibrary?: ThemeLibraryLoader;
}

export function provideBlueprintApp(context: BlueprintAppContext): BlueprintAppContext {
  setContext(KEY, context);
  return context;
}

export function useBlueprintApp(): BlueprintAppContext {
  const context = getContext<BlueprintAppContext | undefined>(KEY);
  if (!context) throw new Error('useBlueprintApp() must be used inside <BlueprintApp>');
  return context;
}
