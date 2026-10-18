import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { AdminDatabase, Impersonation } from '../database/schema.ts';
import { type AdminServices, createServices } from '../domain/services.ts';

const KEY = Symbol('admin-console');

export interface AdminConsole {
  runtime: PrototypeRuntime<AdminDatabase>;
  db: AdminDatabase;
  services: AdminServices;
  /** The active impersonation (live), shared by the shell banner and every screen. */
  impersonation: LiveQuery<Impersonation | undefined>;
}

/** Called once in App.svelte (during component init); screens read it with `useAdmin()`. */
export function provideAdmin(): AdminConsole {
  const runtime = getRuntime() as unknown as PrototypeRuntime<AdminDatabase>;
  const admin: AdminConsole = {
    runtime,
    db: runtime.db,
    services: createServices(runtime),
    impersonation: liveQuery(() => runtime.db.impersonation.get('active')),
  };
  setContext(KEY, admin);
  return admin;
}

export function useAdmin(): AdminConsole {
  const admin = getContext<AdminConsole | undefined>(KEY);
  if (!admin) throw new Error('useAdmin() must be used inside App.svelte');
  return admin;
}
