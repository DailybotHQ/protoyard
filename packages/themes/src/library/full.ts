import { setExpandedLibraryLoader } from './registry.ts';

/**
 * Makes Texuli's expanded theme set part of the library: `loadFullLibraryMeta`
 * lists all 204 themes and `loadLibraryTheme` loads any of them by id (each on
 * demand). Call it once from a page that should offer the full library; pages
 * that do not never reach the expanded set.
 */
export function enableFullThemeLibrary(): void {
  setExpandedLibraryLoader(() => import('@texuli/tokens/library-expand'));
}

/** Back to the catalog only (tests). */
export function disableFullThemeLibrary(): void {
  setExpandedLibraryLoader(undefined);
}
