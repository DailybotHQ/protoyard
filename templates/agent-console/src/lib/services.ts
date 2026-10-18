import { getRuntime } from '@protoyard/renderer-svelte';
import type { ConsoleDatabase } from '../database/schema.ts';
import { type ConsoleServices, createConsoleServices } from '../domain/services.ts';

let cached: ConsoleServices | undefined;

/** Services bound to the mounted runtime (one runtime per prototype document). */
export function services(): ConsoleServices {
  cached ??= createConsoleServices(getRuntime<ConsoleDatabase>());
  return cached;
}

export function db(): ConsoleDatabase {
  return getRuntime<ConsoleDatabase>().db;
}
