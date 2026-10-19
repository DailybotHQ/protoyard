import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { BookingDatabase } from '../database/schema.ts';
import { type BookingServices, createServices } from '../domain/services.ts';

const KEY = Symbol('booking-calendar');

export interface BookingApp {
  runtime: PrototypeRuntime<BookingDatabase>;
  db: BookingDatabase;
  services: BookingServices;
}

/** Called once in App.svelte (during component init); screens read it with `useBooking()`. */
export function provideBooking(): BookingApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<BookingDatabase>;
  const app: BookingApp = { runtime, db: runtime.db, services: createServices(runtime) };
  setContext(KEY, app);
  return app;
}

export function useBooking(): BookingApp {
  const app = getContext<BookingApp | undefined>(KEY);
  if (!app) throw new Error('useBooking() must be used inside App.svelte');
  return app;
}
