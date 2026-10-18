import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { PluginDatabase } from '../database/schema.ts';
import { createPluginServices, type PluginServices } from '../domain/services.ts';

const KEY = Symbol('plugin-panel');

export interface PluginContext {
  runtime: PrototypeRuntime<PluginDatabase>;
  db: PluginDatabase;
  services: PluginServices;
}

export function providePlugin(runtime?: PrototypeRuntime<PluginDatabase>): PluginContext {
  const rt = runtime ?? getRuntime<PluginDatabase>();
  const value: PluginContext = { runtime: rt, db: rt.db, services: createPluginServices(rt) };
  setContext(KEY, value);
  return value;
}

export function usePlugin(): PluginContext {
  const value = getContext<PluginContext | undefined>(KEY);
  if (!value) throw new Error('usePlugin() must be used inside App.svelte');
  return value;
}
