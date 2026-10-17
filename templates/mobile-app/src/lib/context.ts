import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { AppDatabase } from '../database/schema.ts';
import { createItemServices, type ItemServices } from '../domain/items.ts';

const KEY = Symbol('mobile-app');

/** Everything screens need: the runtime, the typed database and the services. */
export interface AppContext {
  runtime: PrototypeRuntime<AppDatabase>;
  db: AppDatabase;
  items: ItemServices;
}

/** Called once in App.svelte (or a test host); screens read it with `useApp()`. */
export function provideApp(runtime?: PrototypeRuntime<AppDatabase>): AppContext {
  const rt = runtime ?? getRuntime<AppDatabase>();
  const app: AppContext = { runtime: rt, db: rt.db, items: createItemServices(rt) };
  setContext(KEY, app);
  return app;
}

export function useApp(): AppContext {
  const app = getContext<AppContext | undefined>(KEY);
  if (!app) throw new Error('useApp() must be used inside App.svelte');
  return app;
}
