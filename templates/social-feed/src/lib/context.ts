import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { SocialDatabase } from '../database/schema.ts';
import { createServices, type SocialServices } from '../domain/services.ts';

const KEY = Symbol('social-feed');

export interface SocialApp {
  runtime: PrototypeRuntime<SocialDatabase>;
  db: SocialDatabase;
  services: SocialServices;
}

/** Called once in App.svelte (during component init); screens read it with `useSocial()`. */
export function provideSocial(): SocialApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<SocialDatabase>;
  const app: SocialApp = { runtime, db: runtime.db, services: createServices(runtime) };
  setContext(KEY, app);
  return app;
}

export function useSocial(): SocialApp {
  const app = getContext<SocialApp | undefined>(KEY);
  if (!app) throw new Error('useSocial() must be used inside App.svelte');
  return app;
}

/** The person id of a persona (every persona has a profile in the network). */
export const personIdOf = (personaId: string | undefined) =>
  personaId ? `person_${personaId}` : null;
