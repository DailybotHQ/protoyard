import { getRuntime } from '@protoyard/renderer-svelte';
import type { CanvasBoardDatabase } from '../database/schema.ts';
import { type BoardServices, createBoardServices } from '../domain/boards.ts';

let cached: BoardServices | undefined;

/** Services bound to the mounted runtime (one runtime per prototype document). */
export function boardsService(): BoardServices {
  cached ??= createBoardServices(getRuntime<CanvasBoardDatabase>());
  return cached;
}

export function db(): CanvasBoardDatabase {
  return getRuntime<CanvasBoardDatabase>().db;
}
