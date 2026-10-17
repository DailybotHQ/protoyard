import { getRuntime } from '@protoyard/renderer-svelte';
import type { UiKitDatabase } from '../database/schema.ts';
import { createFavoriteServices, type FavoriteServices } from '../domain/favorites.ts';

let cached: FavoriteServices | undefined;

export function favoritesService(): FavoriteServices {
  cached ??= createFavoriteServices(getRuntime<UiKitDatabase>());
  return cached;
}
