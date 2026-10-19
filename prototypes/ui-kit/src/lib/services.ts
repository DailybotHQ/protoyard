import { getRuntime } from '@protoyard/renderer-svelte';
import type { ThemeControllerExtras } from '@protoyard/runtime';
import type { UiKitDatabase } from '../database/schema.ts';
import { createFavoriteServices, type FavoriteServices } from '../domain/favorites.ts';
import { createThemeLabServices, type ThemeLabServices } from '../domain/themes.ts';

let cachedFavorites: FavoriteServices | undefined;
let cachedThemes: ThemeLabServices | undefined;

export function favoritesService(): FavoriteServices {
  cachedFavorites ??= createFavoriteServices(getRuntime<UiKitDatabase>());
  return cachedFavorites;
}

export function themeLabService(): ThemeLabServices {
  if (!cachedThemes) {
    const runtime = getRuntime();
    const extras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;
    cachedThemes = createThemeLabServices(runtime, extras);
  }
  return cachedThemes;
}
