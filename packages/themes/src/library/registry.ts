import type { Theme } from '@protoyard/core';
import { LIBRARY_THEME_DEFINITIONS } from './definitions.ts';
import {
  type LibraryThemeDefinition,
  type LibraryThemeMeta,
  THEME_COLLECTIONS,
  type ThemeCollection,
  type ThemeMood,
} from './types.ts';

function toMeta(definition: LibraryThemeDefinition): LibraryThemeMeta {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    tags: definition.tags,
    collection: definition.collection ?? 'industry',
    mood: definition.mood ?? [],
    darkFirst: definition.darkFirst ?? false,
    contrastLevel: definition.contrastLevel ?? 'AA',
    seed: definition.seed,
    ...(definition.secondary ? { secondary: definition.secondary } : {}),
    ...(definition.neutral ? { neutral: definition.neutral } : {}),
  };
}

/** Lightweight catalog for pickers (≤ metadata only — no palette tokens). */
export const THEME_LIBRARY_META: readonly LibraryThemeMeta[] =
  LIBRARY_THEME_DEFINITIONS.map(toMeta);

export function listThemeLibrary(filter?: {
  category?: string;
  tag?: string;
  collection?: ThemeCollection;
  mood?: ThemeMood;
}): readonly LibraryThemeMeta[] {
  return THEME_LIBRARY_META.filter((meta) => {
    if (filter?.category && meta.category !== filter.category) return false;
    if (filter?.tag && !meta.tags.includes(filter.tag)) return false;
    if (filter?.collection && meta.collection !== filter.collection) return false;
    if (filter?.mood && !meta.mood.includes(filter.mood)) return false;
    return true;
  });
}

/** Where a query word matched, by weight: the name or id counts most, the description least. */
function fieldScore(meta: LibraryThemeMeta, word: string): number {
  if (meta.name.toLowerCase().includes(word) || meta.id.includes(word)) return 3;
  if (
    meta.tags.some((tag) => tag.toLowerCase().includes(word)) ||
    meta.mood.some((mood) => mood.includes(word)) ||
    meta.category.toLowerCase().includes(word) ||
    meta.collection.includes(word)
  ) {
    return 2;
  }
  return meta.description.toLowerCase().includes(word) ? 1 : 0;
}

/**
 * Case-insensitive search over name, id, tags, mood, category, collection and
 * description. Every word of the query must match somewhere; results are
 * ordered by score (name matches first), then by library order, so the same
 * query always returns the same list. An empty query returns the whole library.
 */
export function searchThemeLibrary(query: string): readonly LibraryThemeMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return THEME_LIBRARY_META;
  const scored: { meta: LibraryThemeMeta; score: number; index: number }[] = [];
  THEME_LIBRARY_META.forEach((meta, index) => {
    let score = 0;
    for (const word of words) {
      const value = fieldScore(meta, word);
      if (value === 0) return;
      score += value;
    }
    scored.push({ meta, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.meta);
}

/** Every collection in a fixed order, with how many library themes it holds. */
export function listCollections(): readonly { id: ThemeCollection; count: number }[] {
  return THEME_COLLECTIONS.map((id) => ({
    id,
    count: THEME_LIBRARY_META.filter((meta) => meta.collection === id).length,
  }));
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
