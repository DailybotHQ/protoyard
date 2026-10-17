import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { CrmDatabase } from '../database/schema.ts';
import { type CrmServices, createCrmServices } from '../domain/services.ts';

const KEY = Symbol('crm');

export interface Crm {
  runtime: PrototypeRuntime<CrmDatabase>;
  db: CrmDatabase;
  services: CrmServices;
}

/** Called once in App.svelte; screens read it with `useCrm()`. */
export function provideCrm(): Crm {
  const runtime = getRuntime() as unknown as PrototypeRuntime<CrmDatabase>;
  const crm: Crm = { runtime, db: runtime.db, services: createCrmServices(runtime) };
  setContext(KEY, crm);
  return crm;
}

export function useCrm(): Crm {
  const crm = getContext<Crm | undefined>(KEY);
  if (!crm) throw new Error('useCrm() must be used inside App.svelte');
  return crm;
}
