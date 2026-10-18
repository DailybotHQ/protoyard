import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { DesktopDatabase } from '../database/schema.ts';
import { createServices, type DesktopServices } from '../domain/services.ts';

const KEY = Symbol('desktop-app');

export interface DesktopApp {
  runtime: PrototypeRuntime<DesktopDatabase>;
  db: DesktopDatabase;
  services: DesktopServices;
}

/** Called once in App.svelte (or a test host); components read it with `useDesktop()`. */
export function provideDesktop(runtime?: PrototypeRuntime<DesktopDatabase>): DesktopApp {
  const rt = runtime ?? (getRuntime() as unknown as PrototypeRuntime<DesktopDatabase>);
  const app: DesktopApp = { runtime: rt, db: rt.db, services: createServices(rt) };
  setContext(KEY, app);
  return app;
}

export function useDesktop(): DesktopApp {
  const app = getContext<DesktopApp | undefined>(KEY);
  if (!app) throw new Error('useDesktop() must be used inside App.svelte');
  return app;
}
