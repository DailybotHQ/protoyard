import { resetExpandedLibraryLoader, setExpandedLibraryLoader } from './registry.ts';

/**
 * Kept for compatibility: the full library (all 204 themes on Texuli 0.9.0)
 * is on by default since PLAN_008, so this only restores the default loader
 * after `disableFullThemeLibrary()`.
 */
export function enableFullThemeLibrary(): void {
  resetExpandedLibraryLoader();
}

/** Back to the catalog only (tests, or a host that must not load the expanded set). */
export function disableFullThemeLibrary(): void {
  setExpandedLibraryLoader(undefined);
}
