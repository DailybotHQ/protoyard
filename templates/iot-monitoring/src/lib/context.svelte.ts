import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { MonitoringDatabase } from '../database/schema.ts';
import { createMonitoringServices } from '../domain/services.ts';

const KEY = Symbol('iot-monitoring');
export function provideMonitoring() {
  const runtime = getRuntime() as unknown as PrototypeRuntime<MonitoringDatabase>;
  const context = { runtime, db: runtime.db, services: createMonitoringServices(runtime) };
  setContext(KEY, context);
  return context;
}
export function useMonitoring() {
  const value = getContext<ReturnType<typeof provideMonitoring> | undefined>(KEY);
  if (!value) throw new Error('useMonitoring() must be called inside App.svelte');
  return value;
}
