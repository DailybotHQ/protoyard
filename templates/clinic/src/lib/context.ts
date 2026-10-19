import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { ClinicDatabase } from '../database/schema.ts';
import { type ClinicServices, createServices } from '../domain/services.ts';

const KEY = Symbol('clinic');

export interface ClinicApp {
  runtime: PrototypeRuntime<ClinicDatabase>;
  db: ClinicDatabase;
  services: ClinicServices;
}

/** Called once in App.svelte (during component init); screens read it with `useClinic()`. */
export function provideClinic(): ClinicApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<ClinicDatabase>;
  const app: ClinicApp = { runtime, db: runtime.db, services: createServices(runtime) };
  setContext(KEY, app);
  return app;
}

export function useClinic(): ClinicApp {
  const app = getContext<ClinicApp | undefined>(KEY);
  if (!app) throw new Error('useClinic() must be used inside App.svelte');
  return app;
}
