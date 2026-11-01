import type { Theme } from '@protoyard/core';
import {
  loadLibraryTheme as loadTexuliLibraryTheme,
  loadLibraryThemeCharts as loadTexuliLibraryThemeCharts,
  loadLibraryThemeDefinition as loadTexuliLibraryThemeDefinition,
  THEME_LIBRARY_META as TEXULI_LIBRARY_META,
} from '@texuli/tokens/library';
import { fromTexuliTheme } from '../from-texuli.ts';
import { ALL_LIBRARY_THEME_IDS, isLibraryThemeId } from './ids.ts';
import {
  type LibraryThemeDefinition,
  type LibraryThemeMeta,
  THEME_COLLECTIONS,
  type ThemeCollection,
  type ThemeMood,
} from './types.ts';

/**
 * The theme library: Texuli's port, `@texuli/tokens/library`, plus its
 * expanded set, `@texuli/tokens/library-expand`. All 204 library themes (on
 * Texuli 0.9.0) can be listed, searched and loaded by id, by default.
 *
 * - The **catalog** (`THEME_LIBRARY_META` and the synchronous lookups) is
 *   Texuli's 64-theme metadata, imported statically: `@texuli/tokens`
 *   declares `sideEffects`, so only its metadata module reaches the bundle.
 *   Definitions and tokens load on demand from the same port, one theme at a
 *   time. Protoyard keeps no copy of the definitions; a test proves the port
 *   is field-identical to the 64 Protoyard used to define.
 * - The **full library** adds Texuli's expanded set (140 more, without the six
 *   Protoyard built-ins it also carries: they stay `BUILTIN_THEMES`). Its
 *   metadata loads on demand (`loadFullLibraryMeta`, `searchFullThemeLibrary`,
 *   `listFullThemeLibrary`), and each theme's tokens load on their own when
 *   `loadLibraryTheme` asks for it. Only a dynamic import reaches the
 *   expanded set, so no initial chunk carries it. Single-file exports, which
 *   inline every reachable chunk, leave out every expanded theme but the one
 *   the blueprint uses (`protoyard quick export --single-file`); where the
 *   expanded set cannot load, the full library is the catalog.
 */

/** The synchronous catalog for pickers (metadata only, no palette tokens). */
export const THEME_LIBRARY_META: readonly LibraryThemeMeta[] =
  TEXULI_LIBRARY_META as readonly LibraryThemeMeta[];

const catalogIds = new Set(THEME_LIBRARY_META.map((meta) => meta.id));

/** Filters of `listThemeLibrary` and `listFullThemeLibrary`. */
export interface LibraryFilter {
  category?: string;
  tag?: string;
  collection?: ThemeCollection;
  mood?: ThemeMood;
}

function filterLibrary(
  list: readonly LibraryThemeMeta[],
  filter?: LibraryFilter
): readonly LibraryThemeMeta[] {
  return list.filter((meta) => {
    if (filter?.category && meta.category !== filter.category) return false;
    if (filter?.tag && !meta.tags.includes(filter.tag)) return false;
    if (filter?.collection && meta.collection !== filter.collection) return false;
    if (filter?.mood && !meta.mood.includes(filter.mood)) return false;
    return true;
  });
}

/** The 64 catalog themes, filtered (synchronous; `listFullThemeLibrary` covers all of them). */
export function listThemeLibrary(filter?: LibraryFilter): readonly LibraryThemeMeta[] {
  return filterLibrary(THEME_LIBRARY_META, filter);
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
 * The library search over any list of theme metadata (a picker that already
 * holds the full list searches it synchronously). Same rules as
 * `searchThemeLibrary`.
 */
export function searchThemeMeta(
  list: readonly LibraryThemeMeta[],
  query: string
): readonly LibraryThemeMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const scored: { meta: LibraryThemeMeta; score: number; index: number }[] = [];
  list.forEach((meta, index) => {
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

/**
 * Case-insensitive search over name, id, tags, mood, category, collection and
 * description of the 64 catalog themes (`searchFullThemeLibrary` covers all
 * of them). Every word of the query must match somewhere; results are
 * ordered by score (name matches first), then by library order, so the same
 * query always returns the same list. An empty query returns the whole list.
 */
export function searchThemeLibrary(query: string): readonly LibraryThemeMeta[] {
  return searchThemeMeta(THEME_LIBRARY_META, query);
}

/** Every collection in a fixed order, with how many themes of `list` it holds. */
export function countThemeCollections(
  list: readonly LibraryThemeMeta[]
): readonly { id: ThemeCollection; count: number }[] {
  return THEME_COLLECTIONS.map((id) => ({
    id,
    count: list.filter((meta) => meta.collection === id).length,
  }));
}

/** Every collection in a fixed order, with how many catalog themes it holds. */
export function listCollections(): readonly { id: ThemeCollection; count: number }[] {
  return countThemeCollections(THEME_LIBRARY_META);
}

export function getLibraryThemeMeta(id: string): LibraryThemeMeta | undefined {
  return THEME_LIBRARY_META.find((meta) => meta.id === id);
}

/** Texuli's expanded library module (`@texuli/tokens/library-expand`). */
export type ExpandedLibraryModule = typeof import('@texuli/tokens/library-expand');
type ExpandModule = ExpandedLibraryModule;

/** The default loader of Texuli's expanded set: a dynamic import, never part of an initial chunk. */
const defaultExpandLoader = (): Promise<ExpandModule> => import('@texuli/tokens/library-expand');

let expandLoader: (() => Promise<ExpandModule>) | undefined = defaultExpandLoader;
let expandModule: Promise<ExpandModule> | undefined;
let fullMeta: Promise<readonly LibraryThemeMeta[]> | undefined;

/**
 * Replaces the loader of Texuli's expanded set (tests, hosts that serve it
 * another way). `undefined` removes it: the full library is then the
 * catalog. `resetExpandedLibraryLoader()` restores the default.
 */
export function setExpandedLibraryLoader(loader: (() => Promise<ExpandModule>) | undefined): void {
  expandLoader = loader;
  expandModule = undefined;
  fullMeta = undefined;
}

/** Restores the default loader of the expanded set (a dynamic import of `@texuli/tokens/library-expand`). */
export function resetExpandedLibraryLoader(): void {
  setExpandedLibraryLoader(defaultExpandLoader);
}

/** The expanded module, or `undefined` without a loader. A failed load is retried on the next call. */
function loadExpand(): Promise<ExpandModule> | undefined {
  if (!expandLoader) return undefined;
  if (!expandModule) {
    const pending = expandLoader();
    expandModule = pending;
    pending.catch(() => {
      if (expandModule === pending) expandModule = undefined;
    });
  }
  return expandModule;
}

/** Catalog first, then the expanded themes without the built-ins and catalog ids. */
function mergeFullMeta(expand: ExpandModule): readonly LibraryThemeMeta[] {
  const skip = new Set<string>([...expand.BUILTIN_PRESET_IDS, ...catalogIds]);
  return Object.freeze([
    ...THEME_LIBRARY_META,
    ...(expand.EXPAND_THEME_LIBRARY_META as readonly LibraryThemeMeta[]).filter(
      (meta) => !skip.has(meta.id)
    ),
  ]);
}

/**
 * Every library theme's metadata, the catalog first: Texuli's expanded themes
 * follow, without the six Protoyard built-ins. Loads on first use. When the
 * expanded set cannot load (no loader, or a single-file export that left it
 * out), it resolves to the catalog, and a later call tries again.
 */
export function loadFullLibraryMeta(): Promise<readonly LibraryThemeMeta[]> {
  if (fullMeta) return fullMeta;
  const expanded = loadExpand();
  if (!expanded) return Promise.resolve(THEME_LIBRARY_META);
  // The cached promise is the caught one, so a second caller during the load
  // never gets a rejection either.
  const pending: Promise<readonly LibraryThemeMeta[]> = expanded.then(mergeFullMeta).catch(() => {
    if (fullMeta === pending) fullMeta = undefined;
    return THEME_LIBRARY_META;
  });
  fullMeta = pending;
  return pending;
}

/** Every library theme (catalog and expanded), filtered like `listThemeLibrary`. */
export async function listFullThemeLibrary(
  filter?: LibraryFilter
): Promise<readonly LibraryThemeMeta[]> {
  return filterLibrary(await loadFullLibraryMeta(), filter);
}

/** `searchThemeLibrary` over every library theme (catalog and expanded), same order rules. */
export async function searchFullThemeLibrary(query: string): Promise<readonly LibraryThemeMeta[]> {
  return searchThemeMeta(await loadFullLibraryMeta(), query);
}

/** Every collection in a fixed order, with how many library themes (catalog and expanded) it holds. */
export async function listFullCollections(): Promise<
  readonly { id: ThemeCollection; count: number }[]
> {
  return countThemeCollections(await loadFullLibraryMeta());
}

/** Metadata of any library theme (catalog or expanded), or `undefined`. */
export async function findLibraryThemeMeta(id: string): Promise<LibraryThemeMeta | undefined> {
  const catalog = getLibraryThemeMeta(id);
  if (catalog || !isLibraryThemeId(id)) return catalog;
  return (await loadFullLibraryMeta()).find((meta) => meta.id === id);
}

function unknownTheme(id: string): Error {
  return new Error(`Unknown library theme "${id}". Known ids: ${ALL_LIBRARY_THEME_IDS.join(', ')}`);
}

/** Texuli's expanded module for an expanded id; rejects for unknown ids or when it cannot load. */
async function expandFor(id: string): Promise<ExpandModule> {
  if (!isLibraryThemeId(id)) throw unknownTheme(id);
  const expanded = loadExpand();
  if (!expanded) {
    throw new Error(
      `Library theme "${id}" is in Texuli's expanded set, which this page cannot load.`
    );
  }
  return expanded;
}

/** Any library theme's definition (seed, neutral family, fonts, style). */
export async function loadLibraryThemeDefinition(id: string): Promise<LibraryThemeDefinition> {
  if (catalogIds.has(id)) {
    return (await loadTexuliLibraryThemeDefinition(id)) as LibraryThemeDefinition;
  }
  const expand = await expandFor(id);
  return (await expand.loadExpandThemeDefinition(id)) as LibraryThemeDefinition;
}

async function loadTheme(id: string): Promise<Theme> {
  if (catalogIds.has(id)) {
    const [theme, charts] = await Promise.all([
      loadTexuliLibraryTheme(id),
      loadTexuliLibraryThemeCharts(id),
    ]);
    return fromTexuliTheme(theme, charts);
  }
  const expand = await expandFor(id);
  const [theme, charts] = await Promise.all([
    expand.loadExpandTheme(id),
    expand.loadFullLibraryThemeCharts(id),
  ]);
  return fromTexuliTheme(theme, charts);
}

const cache = new Map<string, Promise<Theme>>();

/**
 * Loads any library theme's tokens from `@texuli/tokens` as a Protoyard
 * theme. Cached per id; a failed load may be retried. Unknown ids, the
 * built-in ids included, reject with the list of known ids.
 */
export function loadLibraryTheme(id: string): Promise<Theme> {
  const cached = cache.get(id);
  if (cached) return cached;
  const pending = loadTheme(id);
  pending.catch(() => cache.delete(id));
  cache.set(id, pending);
  return pending;
}

/** Eager load every catalog theme (tests / offline galleries). */
export async function loadAllLibraryThemes(): Promise<readonly Theme[]> {
  return Promise.all(THEME_LIBRARY_META.map((meta) => loadLibraryTheme(meta.id)));
}

/** Eager load every theme of the full library, expanded set included (tests, the gallery build). */
export async function loadAllFullLibraryThemes(): Promise<readonly Theme[]> {
  return Promise.all((await loadFullLibraryMeta()).map((meta) => loadLibraryTheme(meta.id)));
}

/** Clear the in-memory theme token cache (tests). */
export function clearLibraryThemeCache(): void {
  cache.clear();
}
