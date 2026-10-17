import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { DashboardDatabase, WorkspaceSettings } from '../database/schema.ts';
import { createServices, type DashboardServices } from '../domain/services.ts';

const KEY = Symbol('dashboard');

export interface Dashboard {
  runtime: PrototypeRuntime<DashboardDatabase>;
  db: DashboardDatabase;
  services: DashboardServices;
  /** Live workspace settings (currency, name…), shared by every screen. */
  settings: LiveQuery<WorkspaceSettings | undefined>;
}

/** Called once in App.svelte (during component init); screens read it with `useDashboard()`. */
export function provideDashboard(): Dashboard {
  const runtime = getRuntime() as unknown as PrototypeRuntime<DashboardDatabase>;
  const dashboard: Dashboard = {
    runtime,
    db: runtime.db,
    services: createServices(runtime),
    settings: liveQuery(() => runtime.db.settings.get('workspace')),
  };
  setContext(KEY, dashboard);
  return dashboard;
}

export function useDashboard(): Dashboard {
  const dashboard = getContext<Dashboard | undefined>(KEY);
  if (!dashboard) throw new Error('useDashboard() must be used inside App.svelte');
  return dashboard;
}
