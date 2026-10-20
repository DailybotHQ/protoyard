import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { WikiDatabase } from '../database/schema.ts';
import { createServices, type WikiServices } from '../domain/services.ts';

const KEY = Symbol('docs-wiki');

export interface WikiApp {
  runtime: PrototypeRuntime<WikiDatabase>;
  db: WikiDatabase;
  services: WikiServices;
}

/** Called once in App.svelte (during component init); screens read it with `useWiki()`. */
export function provideWiki(): WikiApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<WikiDatabase>;
  const app: WikiApp = { runtime, db: runtime.db, services: createServices(runtime) };
  setContext(KEY, app);
  return app;
}

export function useWiki(): WikiApp {
  const app = getContext<WikiApp | undefined>(KEY);
  if (!app) throw new Error('useWiki() must be used inside App.svelte');
  return app;
}
