import type { EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import { blueprint } from '../generated/blueprint.ts';
import { createServices } from '../generated/services.ts';

const KEY = Symbol('crud-app');

export interface CrudAppContext {
  runtime: PrototypeRuntime;
  services: EntityServices;
  blueprint: typeof blueprint;
}

export function provideCrudApp(runtime?: PrototypeRuntime): CrudAppContext {
  const rt = runtime ?? getRuntime();
  const ctx: CrudAppContext = {
    runtime: rt,
    services: createServices(rt),
    blueprint,
  };
  setContext(KEY, ctx);
  return ctx;
}

export function useCrudApp(): CrudAppContext {
  const ctx = getContext<CrudAppContext | undefined>(KEY);
  if (!ctx) throw new Error('useCrudApp() must be used under App.svelte');
  return ctx;
}
