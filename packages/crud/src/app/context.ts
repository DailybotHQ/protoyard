import type { AppModel, AppRoute, Blueprint, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import type { HashRouter } from '@protoyard/renderer-svelte';
import { type Component, getContext, setContext } from 'svelte';

const KEY = Symbol('protoyard-blueprint-app');

/**
 * A record's `/<plural>/:id` route (the entity page's edit form). The id is
 * encoded: ids with `/`, `?` or `#` must not split the route.
 */
export function entityRecordRoute(plural: string, id: string): string {
  return `/${plural}/${encodeURIComponent(id)}`;
}

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
  /** Replaces the built-in overview on the `home` route. */
  // biome-ignore lint/suspicious/noExplicitAny: app screens take route props.
  readonly home?: Component<any>;
  /** Where a record opens: the app's `recordHref`, else its `/<plural>/:id` route. */
  recordPath(entityName: string, id: string): string;
}

/**
 * Where a record of `entityName` opens, or undefined for the default (its
 * `/<plural>/:id` route, the entity page's edit form).
 */
export type RecordHref = (entityName: string, id: string) => string | undefined;

export function provideBlueprintApp(context: BlueprintAppContext): BlueprintAppContext {
  setContext(KEY, context);
  return context;
}

export function useBlueprintApp(): BlueprintAppContext {
  const context = getContext<BlueprintAppContext | undefined>(KEY);
  if (!context) throw new Error('useBlueprintApp() must be used inside <BlueprintApp>');
  return context;
}
