import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { FintechDatabase } from '../database/schema.ts';
import { createFintechServices } from '../domain/services.ts';

const KEY = Symbol('fintech-dashboard');

export function provideFintech() {
  const runtime = getRuntime() as unknown as PrototypeRuntime<FintechDatabase>;
  const value = { runtime, db: runtime.db, services: createFintechServices(runtime) };
  setContext(KEY, value);
  return value;
}

export function useFintech() {
  const value = getContext<ReturnType<typeof provideFintech> | undefined>(KEY);
  if (!value) throw new Error('useFintech() must be called inside App.svelte');
  return value;
}
