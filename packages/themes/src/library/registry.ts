import type { Theme } from '@protoyard/core';
import { LIBRARY_THEME_DEFINITIONS } from './definitions.ts';
import type { LibraryThemeDefinition, LibraryThemeMeta } from './types.ts';

function toMeta(definition: LibraryThemeDefinition): LibraryThemeMeta {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    tags: definition.tags,
    seed: definition.seed,
    ...(definition.secondary ? { secondary: definition.secondary } : {}),
  };
}

/** Lightweight catalog for pickers (≤ metadata only — no palette tokens). */
export const THEME_LIBRARY_META: readonly LibraryThemeMeta[] =
  LIBRARY_THEME_DEFINITIONS.map(toMeta);

export function listThemeLibrary(filter?: {
  category?: string;
  tag?: string;
}): readonly LibraryThemeMeta[] {
  return THEME_LIBRARY_META.filter((meta) => {
    if (filter?.category && meta.category !== filter.category) return false;
    if (filter?.tag && !meta.tags.includes(filter.tag)) return false;
    return true;
  });
}

export function getLibraryThemeMeta(id: string): LibraryThemeMeta | undefined {
  return THEME_LIBRARY_META.find((meta) => meta.id === id);
}

export function getLibraryThemeDefinition(id: string): LibraryThemeDefinition | undefined {
  return LIBRARY_THEME_DEFINITIONS.find((definition) => definition.id === id);
}

const cache = new Map<string, Theme>();

/**
 * Loads a library theme's tokens. Uses a dynamic import of the builder so the
 * palette engine stays out of the eager metadata chunk in bundlers that split
 * on `import()`.
 */
export async function loadLibraryTheme(id: string): Promise<Theme> {
  const cached = cache.get(id);
  if (cached) return cached;
  const definition = getLibraryThemeDefinition(id);
  if (!definition) {
    throw new Error(
      `Unknown library theme "${id}". Known ids: ${THEME_LIBRARY_META.map((m) => m.id).join(', ')}`
    );
  }
  const { themeFromDefinition } = await import('./build.ts');
  const theme = themeFromDefinition(definition);
  cache.set(id, theme);
  return theme;
}

/** Eager load every library theme (tests / offline galleries). */
export async function loadAllLibraryThemes(): Promise<readonly Theme[]> {
  return Promise.all(THEME_LIBRARY_META.map((meta) => loadLibraryTheme(meta.id)));
}

/** Clear the in-memory theme token cache (tests). */
export function clearLibraryThemeCache(): void {
  cache.clear();
}
