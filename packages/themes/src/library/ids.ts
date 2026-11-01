import { EXPAND_THEME_IDS, PORT_THEME_IDS } from '@texuli/tokens/library-ids';

/**
 * The catalog's 64 theme ids, for code on the boot path that only checks an
 * id (blueprint brand validation). They come from Texuli's ids-only entry
 * (`@texuli/tokens/library-ids`, about 1.7 KB gzip, G125): reading them from
 * `THEME_LIBRARY_META` would put Texuli's whole port records module (about
 * 23 KB) in every player page's first-load chunk.
 */
export const LIBRARY_THEME_IDS: readonly string[] = PORT_THEME_IDS;

/**
 * The 140 ids of Texuli's expanded set (`@texuli/tokens/library-expand`),
 * without the six Protoyard built-ins it also carries, in Texuli's metadata
 * order. Ids only (`@texuli/tokens/library-ids`, G125): the expanded metadata
 * module is about 42 KB and loads on demand.
 */
export const EXPANDED_LIBRARY_THEME_IDS: readonly string[] = EXPAND_THEME_IDS;

/** Every library theme id: the catalog first, then the expanded set (204: the 64 catalog themes and Texuli's 140 expanded ones). */
export const ALL_LIBRARY_THEME_IDS: readonly string[] = Object.freeze([
  ...LIBRARY_THEME_IDS,
  ...EXPANDED_LIBRARY_THEME_IDS,
]);

const catalog = new Set(LIBRARY_THEME_IDS);
const all = new Set(ALL_LIBRARY_THEME_IDS);

/** Whether `id` names any library theme, catalog or expanded (not a built-in). */
export function isLibraryThemeId(id: string): boolean {
  return all.has(id);
}

/** Whether `id` names one of the 64 catalog themes (metadata available synchronously). */
export function isCatalogThemeId(id: string): boolean {
  return catalog.has(id);
}

/** Whether `id` names one of the expanded set's themes (metadata and tokens load on demand). */
export function isExpandedLibraryThemeId(id: string): boolean {
  return all.has(id) && !catalog.has(id);
}
