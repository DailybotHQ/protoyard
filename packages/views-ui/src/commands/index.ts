/**
 * `@protoyard/views-ui/commands` — the app command palette. `createCommands`
 * builds the list from route metadata, registered actions and recent records,
 * filtered by capability and re-filtered on persona switches;
 * `AppCommandPalette` adds ⌘K / Ctrl+K and action shortcuts, and loads its
 * dialog lazily on first open. DevTools keep Ctrl/⌘ + `.`.
 */
export { default as AppCommandPalette } from './AppCommandPalette.svelte';
export { isMacPlatform, shortcutKeys, shortcutLabel } from './platform.ts';
export {
  type CommandAction,
  type CommandEntry,
  type CommandKind,
  type CommandRegistry,
  createCommands,
  eventShortcut,
  normalizeShortcut,
  type RecentRecord,
  type RouteLike,
} from './registry.ts';
