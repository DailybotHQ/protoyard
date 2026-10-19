import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { LogisticsDatabase } from '../database/schema.ts';
import { createLogisticsServices } from '../domain/services.ts';

const KEY = Symbol('logistics-map');
export function provideLogistics() {
  const runtime = getRuntime() as unknown as PrototypeRuntime<LogisticsDatabase>;
  const context = { runtime, db: runtime.db, services: createLogisticsServices(runtime) };
  setContext(KEY, context);
  return context;
}
export function useLogistics() {
  const value = getContext<ReturnType<typeof provideLogistics> | undefined>(KEY);
  if (!value) throw new Error('useLogistics() must be called inside App.svelte');
  return value;
}
