/**
 * `@protoyard/crud/app`: the blueprint app shell (ADR-029). `BlueprintApp`
 * renders any parsed blueprint from its app model with no generated code:
 * layout navigation, hash routes, entity pages, home counts, members, search,
 * notifications and every registered screen kind, each loaded lazily.
 * A lazy subpath: never re-exported from the `@protoyard/crud` barrel.
 */
export { default as BlueprintApp } from './BlueprintApp.svelte';
export {
  type BlueprintAppContext,
  provideBlueprintApp,
  type RecordHref,
  type ThemeLibraryLoader,
  useBlueprintApp,
} from './context.ts';
export { default as EntityPage } from './EntityPage.svelte';
export { NAV_ICONS } from './icons.ts';
