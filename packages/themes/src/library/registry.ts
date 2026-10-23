import type { Theme } from '@protoyard/core';
import { THEME_LIBRARY_META as TEXULI_LIBRARY_META } from '@texuli/tokens/library';
import { fromTexuliTheme } from '../from-texuli.ts';
import {
  type LibraryThemeDefinition,
  type LibraryThemeMeta,
  THEME_COLLECTIONS,
  type ThemeCollection,
  type ThemeMood,
} from './types.ts';

/**
 * The theme library: Texuli's port, `@texuli/tokens/library`.
 *
 * - The **catalog** (`THEME_LIBRARY_META` and the synchronous lookups) is
 *   Texuli's 64-theme metadata, imported statically: `@texuli/tokens`
 *   declares `sideEffects`, so only its metadata module reaches the bundle.
 *   Definitions and tokens load on demand from the same port, one theme at a
 *   time. Protoyard keeps no copy of the definitions; a test proves the port
 *   is field-identical to the 64 Protoyard used to define.
 * - The **full library** adds Texuli's expanded set (140 more, without the six
 *   Protoyard built-ins it also carries: they stay `BUILTIN_THEMES`) once a
 *   page calls `enableFullThemeLibrary()` (`@protoyard/themes/library-full`).
 *   Its metadata then loads on demand (`loadFullLibraryMeta`), and
 *   `loadLibraryTheme` accepts every id of it: all 204 by id. It is opt-in
 *   because single-file exports inline everything reachable, and the set
 *   adds about 105 KB to each.
 */

/** The synchronous catalog for pickers (metadata only, no palette tokens). */
export const THEME_LIBRARY_META: readonly LibraryThemeMeta[] =
  TEXULI_LIBRARY_META as readonly LibraryThemeMeta[];

const catalogIds = new Set(THEME_LIBRARY_META.map((meta) => meta.id));

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

/** Every collection in a fixed order, with how many catalog themes it holds. */
export function listCollections(): readonly { id: ThemeCollection; count: number }[] {
  return THEME_COLLECTIONS.map((id) => ({
    id,
    count: THEME_LIBRARY_META.filter((meta) => meta.collection === id).length,
  }));
}

export function getLibraryThemeMeta(id: string): LibraryThemeMeta | undefined {
  return THEME_LIBRARY_META.find((meta) => meta.id === id);
}

/** Texuli's expanded library module (`@texuli/tokens/library-expand`). */
export type ExpandedLibraryModule = typeof import('@texuli/tokens/library-expand');
type ExpandModule = ExpandedLibraryModule;
let expandLoader: (() => Promise<ExpandModule>) | undefined;
let expandModule: Promise<ExpandModule> | undefined;
let fullMeta: Promise<readonly LibraryThemeMeta[]> | undefined;

/**
 * Installs (or, with `undefined`, removes) the loader of Texuli's expanded
 * set. `enableFullThemeLibrary()` (`@protoyard/themes/library-full`) calls it.
 * Without it, the full library is the catalog: the expanded set is not
 * reachable from this module, so default bundles and single-file exports
 * never carry it.
 */
export function setExpandedLibraryLoader(loader: (() => Promise<ExpandModule>) | undefined): void {
  expandLoader = loader;
  expandModule = undefined;
  fullMeta = undefined;
}

function loadExpand(): Promise<ExpandModule> | undefined {
  if (!expandLoader) return undefined;
  expandModule ??= expandLoader();
  return expandModule;
}

/**
 * Every library theme's metadata, the catalog first: Texuli's expanded themes
 * follow, without the six Protoyard built-ins. Loads on first use.
 */
export function loadFullLibraryMeta(): Promise<readonly LibraryThemeMeta[]> {
  const expanded = loadExpand();
  if (!expanded) return Promise.resolve(THEME_LIBRARY_META);
  fullMeta ??= expanded.then((expand) => {
    const skip = new Set<string>([...expand.BUILTIN_PRESET_IDS, ...catalogIds]);
    return Object.freeze([
      ...THEME_LIBRARY_META,
      ...(expand.EXPAND_THEME_LIBRARY_META as readonly LibraryThemeMeta[]).filter(
        (meta) => !skip.has(meta.id)
      ),
    ]);
  });
  return fullMeta;
}

/** Metadata of any library theme (catalog or expanded), or `undefined`. */
export async function findLibraryThemeMeta(id: string): Promise<LibraryThemeMeta | undefined> {
  return getLibraryThemeMeta(id) ?? (await loadFullLibraryMeta()).find((meta) => meta.id === id);
}

async function unknownTheme(id: string): Promise<Error> {
  const known = (await loadFullLibraryMeta()).map((meta) => meta.id);
  return new Error(`Unknown library theme "${id}". Known ids: ${known.join(', ')}`);
}

/** Any library theme's definition (seed, neutral family, fonts, style). */
export async function loadLibraryThemeDefinition(id: string): Promise<LibraryThemeDefinition> {
  if (catalogIds.has(id)) {
    const ported = await import('@texuli/tokens/library');
    return (await ported.loadLibraryThemeDefinition(id)) as LibraryThemeDefinition;
  }
  const expand = loadExpand();
  if (!expand || !(await findLibraryThemeMeta(id))) throw await unknownTheme(id);
  return (await expand).loadExpandThemeDefinition(id) as Promise<LibraryThemeDefinition>;
}

async function loadTheme(id: string): Promise<Theme> {
  if (catalogIds.has(id)) {
    const ported = await import('@texuli/tokens/library');
    const [theme, charts] = await Promise.all([
      ported.loadLibraryTheme(id),
      ported.loadLibraryThemeCharts(id),
    ]);
    return fromTexuliTheme(theme, charts);
  }
  const expanded = loadExpand();
  if (!expanded || !(await findLibraryThemeMeta(id))) throw await unknownTheme(id);
  const expand = await expanded;
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

/** Eager load every theme of the full library, expanded set included. */
export async function loadAllFullLibraryThemes(): Promise<readonly Theme[]> {
  return Promise.all((await loadFullLibraryMeta()).map((meta) => loadLibraryTheme(meta.id)));
}

/** Clear the in-memory theme token cache (tests). */
export function clearLibraryThemeCache(): void {
  cache.clear();
}
