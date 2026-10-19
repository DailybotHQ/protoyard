import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { AnalyticsDatabase } from '../database/schema.ts';
import { type AnalyticsServices, createServices } from '../domain/services.ts';

const KEY = Symbol('analytics');

export interface AnalyticsApp {
  runtime: PrototypeRuntime<AnalyticsDatabase>;
  db: AnalyticsDatabase;
  services: AnalyticsServices;
}

/** Called once in App.svelte (during component init); screens read it with `useAnalytics()`. */
export function provideAnalytics(): AnalyticsApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<AnalyticsDatabase>;
  const app: AnalyticsApp = { runtime, db: runtime.db, services: createServices(runtime) };
  setContext(KEY, app);
  return app;
}

export function useAnalytics(): AnalyticsApp {
  const app = getContext<AnalyticsApp | undefined>(KEY);
  if (!app) throw new Error('useAnalytics() must be used inside App.svelte');
  return app;
}
